import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../CharacterGaze/CharacterGaze";
import { VideoInputManager } from "../RTC/VideoInputManager";
import { ChatMessageService } from "../UI/ChatMessageService";
import { DialogManager } from "../UI/DialogManager";
import { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { CharacterBehaviorState } from "../SincroVRM/VRMCharacter/CharacterBehaviorState";
import { TrackerRuntime } from "../FaceTracking/TrackerRuntime";
import type { SincroFaceMotionSnapshot } from "../FaceTracking/SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../FaceTracking/SincroPoseMotionSnapshot";

const SINCRO_POSE_TARGET_INFERENCE_FPS = 12;

// CharacterGaze の起動と、視線検出結果 -> Debug UI / AutoMute 変換を担当する controller。
// DOM依存（#eyeTarget 表示）は移行期間の暫定としてここに閉じ込めている。
export class SincroCharacterGazeController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private readonly videoInputManager = new VideoInputManager();
    private readonly trackerRuntime: TrackerRuntime;
    private onMuteChange: ((mute: boolean) => void) | null = null;
    private visionInitPromise: Promise<void> | null = null;
    private hasStarted = false;
    private gazeSettingsSnapshot: DialogGazeSettingsSnapshot | null = null;
    private pendingCameraRefreshToken = 0;
    private cameraRefreshChain: Promise<void> = Promise.resolve();

    constructor(
        dialogManager: DialogManager,
        debugConsoleManager: DebugConsoleManager,
        chatMessageService: ChatMessageService,
    ) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageService = chatMessageService;
        this.characterBehaviorState = CharacterBehaviorState.getManager();
        this.trackerRuntime = new TrackerRuntime(this.resolveTrackingVideoElement());
        const characterGaze = CharacterGaze.getManager();
        this.debugConsoleManager.setCharacterGazeTrackingTuning(characterGaze.getTrackingTuning());
        this.debugConsoleManager.setCharacterGazeTrackingTuningChangeCallback((config) => {
            characterGaze.setTrackingTuning(config);
        });
        // Gaze ON/OFF と camera selector の両方に追従できるよう、設定変更は差分監視で扱う。
        this.dialogManager.subscribeSettingsChange(() => {
            this.applyDialogGazeSettings(false);
        });
    }

    // 顔認識を開始し、視線・AutoMute状態をデバッグUIとRTC mute制御へ反映する。
    start(onMuteChange: (mute: boolean) => void): void {
        this.onMuteChange = onMuteChange;
        this.hasStarted = true;

        const characterGaze = CharacterGaze.getManager();
        this.bindCharacterGazeCallbacks(characterGaze, onMuteChange);
        this.applyDialogGazeSettings(true);
    }

    // Dialog 設定から Gaze runtime へ必要な差分だけを反映する。
    private applyDialogGazeSettings(forceAll: boolean): void {
        const next = this.readDialogGazeSettingsSnapshot();
        const prev = this.gazeSettingsSnapshot;
        const videoDeviceChanged = forceAll || !prev || prev.videoInputDeviceId !== next.videoInputDeviceId;
        const gazeEnabledChanged = forceAll || !prev || prev.enableCharacterGaze !== next.enableCharacterGaze;
        const talkModeChanged = forceAll || !prev || prev.talkMode !== next.talkMode;
        const poseTrackingChanged = forceAll || !prev || prev.enableSincroPoseTracking !== next.enableSincroPoseTracking;

        this.characterBehaviorState.setTalkMode(next.talkMode);
        if (videoDeviceChanged) {
            this.videoInputManager.setVideoInputDeviceId(next.videoInputDeviceId);
        }
        this.gazeSettingsSnapshot = next;

        if (!this.hasStarted || !this.onMuteChange) {
            return;
        }

        if (!next.enableCharacterGaze) {
            if (gazeEnabledChanged || videoDeviceChanged) {
                this.stopCharacterGazeCamera();
            }
            return;
        }
        if (gazeEnabledChanged || videoDeviceChanged || talkModeChanged || poseTrackingChanged) {
            this.scheduleCameraRefresh();
        }
    }

    // CharacterGaze の在席/離席 callback は 1 つしか持てないため、毎回上書きして最新設定を参照する。
    private bindCharacterGazeCallbacks(characterGaze: CharacterGaze, onMuteChange: (mute: boolean) => void): void {
        // AutoMute の実適用は RTC controller 側に残し、この controller は視線イベント変換のみ担当する。
        characterGaze.arriveCallback = () => {
            this.debugConsoleManager.updateCharacterEyeStatus(true);
            if (this.dialogManager.enableAutoMute()) {
                onMuteChange(false);
            }
        };
        characterGaze.leaveCallback = () => {
            this.debugConsoleManager.updateCharacterEyeStatus(false);
            if (this.dialogManager.enableAutoMute()) {
                onMuteChange(true);
            }
        };
    }

    private stopCharacterGazeCamera(): void {
        const characterGaze = CharacterGaze.getManager();
        characterGaze.detachCamera();
        this.trackerRuntime.stopFaceTracking("sincro_face_tracking_stopped");
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.videoInputManager.releaseVideoTrack();
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("停止中");
        const eyeTargetElement = document.querySelector("#eyeTarget");
        eyeTargetElement?.setAttribute("fill", "hsl(300 100% 50% / 0%)");
    }

    private scheduleCameraRefresh(): void {
        const refreshToken = ++this.pendingCameraRefreshToken;
        this.cameraRefreshChain = this.cameraRefreshChain
            .catch(() => {
                // 直前の切替失敗で後続チェーンが止まらないようにする。
            })
            .then(async () => {
                if (refreshToken !== this.pendingCameraRefreshToken) {
                    return;
                }
                await this.refreshCharacterGazeCamera(refreshToken);
            });
    }

    private async refreshCharacterGazeCamera(refreshToken: number): Promise<void> {
        if (!this.dialogManager.enableCharacterGaze() || !this.onMuteChange) {
            return;
        }
        const characterGaze = CharacterGaze.getManager();
        this.bindCharacterGazeCallbacks(characterGaze, this.onMuteChange);
        this.debugConsoleManager.setCharacterGazePaused(false);
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);

        try {
            const nextVideoTrack = await this.videoInputManager.reacquireVideoTrack();
            if (refreshToken !== this.pendingCameraRefreshToken || !this.dialogManager.enableCharacterGaze()) {
                nextVideoTrack.stop();
                return;
            }
            nextVideoTrack.addEventListener("ended", () => {
                if (!this.dialogManager.enableCharacterGaze()) {
                    return;
                }
                this.characterBehaviorState.setErrorSource("gaze", "顔トラッキング用カメラの映像トラックが停止しました。");
            });

            if (this.dialogManager.talkMode() === "sincro") {
                await this.startSincroFaceTracking(nextVideoTrack);
            } else {
                await this.startCharacterGazeTracking(characterGaze, nextVideoTrack);
            }
            this.characterBehaviorState.setErrorSource("gaze", null);
            this.characterBehaviorState.setErrorSource("faceMotion", null);
        } catch (error) {
            if (refreshToken !== this.pendingCameraRefreshToken) {
                return;
            }
            console.error("Failed to init CharacterGaze camera.", error);
            this.stopCharacterGazeCamera();
            const detail = error instanceof Error ? error.message : String(error);
            this.characterBehaviorState.setErrorSource("gaze", `顔トラッキング用カメラへの切替に失敗しました。${detail}`);
            const selectedDeviceId = this.videoInputManager.getVideoInputDeviceId();
            const deviceLabel = selectedDeviceId ? `deviceId=${selectedDeviceId}` : "既定デバイス";
            this.chatMessageService.writeErrorMessage(
                `選択した顔トラッキング用カメラへの切替に失敗しました。(${deviceLabel}) - ${detail}`,
            );
        }
    }

    private async startCharacterGazeTracking(characterGaze: CharacterGaze, nextVideoTrack: MediaStreamTrack): Promise<void> {
        this.trackerRuntime.stopFaceTracking("chat_mode_selected");
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        await this.ensureVisionInitialized(characterGaze);
        console.log("start CharacterGaze");
        const started = await characterGaze.initCamera(
            nextVideoTrack,
            (detects: Detection[]) => {
                // 設定変更後も動作が追従するよう、毎フレーム時点の設定を参照する。
                const gazeEnabled = this.dialogManager.enableCharacterGaze()
                    && this.dialogManager.talkMode() !== "sincro";
                // ここが Gaze 状態の主更新点。DebugConsole購読経由で React 側にも値が流れる。
                if (gazeEnabled) {
                    this.debugConsoleManager.updateFaceXLog(characterGaze.targetX());
                    this.debugConsoleManager.updateFaceYLog(characterGaze.targetY());
                    this.debugConsoleManager.updateFacing(characterGaze.facing());
                    this.debugConsoleManager.updateCharacterGazeTargetDebug(characterGaze.targetSelectionDebugText());
                    this.characterBehaviorState.applyGazeState(characterGaze, detects);
                }
                this.updateEyeTargetOverlay(characterGaze, gazeEnabled, detects);
            },
            (error: unknown) => {
                this.handleCharacterGazeRuntimeError(error);
            },
        );
        if (!started) {
            throw new Error("CharacterGaze camera initialization returned false.");
        }
        this.characterBehaviorState.setGazeTrackingEnabled(true);
    }

    private async startSincroFaceTracking(nextVideoTrack: MediaStreamTrack): Promise<void> {
        const characterGaze = CharacterGaze.getManager();
        characterGaze.detachCamera();
        this.updateEyeTargetOverlay(characterGaze, false, []);
        const poseTrackingEnabled = this.dialogManager.enableSincroPoseTracking();
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(true);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(poseTrackingEnabled);
        console.log("start SincroFaceTracker");
        await this.trackerRuntime.startFaceTracking(
            nextVideoTrack,
            {
                onFaceMotion: (snapshot) => {
                    this.handleSincroFaceMotion(snapshot);
                },
                onPoseMotion: (snapshot) => {
                    this.handleSincroPoseMotion(snapshot);
                },
                onPoseFallback: (snapshot) => {
                    this.handleSincroPoseFallback(snapshot);
                },
                onTrackerStats: (snapshot) => {
                    this.debugConsoleManager.updateSincroTrackerStats(snapshot);
                },
                onError: (error) => {
                    this.handleSincroFaceRuntimeError(error);
                },
            },
            undefined,
            {
                enabled: poseTrackingEnabled,
                targetInferenceFps: SINCRO_POSE_TARGET_INFERENCE_FPS,
            },
        );
    }

    private ensureVisionInitialized(characterGaze: CharacterGaze): Promise<void> {
        if (characterGaze.modelIsLoaded()) {
            return Promise.resolve();
        }
        if (!this.visionInitPromise) {
            this.visionInitPromise = characterGaze.initVision()
                .catch((error) => {
                    this.visionInitPromise = null;
                    throw error;
                });
        }
        return this.visionInitPromise;
    }

    private updateEyeTargetOverlay(characterGaze: CharacterGaze, gazeEnabled: boolean, detects: Detection[]): void {
        // 既存 SVG オーバーレイ表示。React へ移しきるまでここで更新を閉じ込める。
        const eyeTargetElement = document.querySelector("#eyeTarget");
        if (!eyeTargetElement) {
            return;
        }
        if (gazeEnabled && detects.length > 0) {
            eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 50%)");
            eyeTargetElement.setAttribute("cx", `${characterGaze.targetX() * 100}%`);
            eyeTargetElement.setAttribute("cy", `${characterGaze.targetY() * 100}%`);
            return;
        }
        eyeTargetElement.setAttribute("fill", "hsl(300 100% 50% / 0%)");
    }

    private handleSincroFaceMotion(snapshot: SincroFaceMotionSnapshot): void {
        if (!this.dialogManager.enableCharacterGaze() || this.dialogManager.talkMode() !== "sincro") {
            return;
        }
        this.characterBehaviorState.applyFaceMotion(snapshot);
        this.debugConsoleManager.updateCharacterEyeStatus(snapshot.detected);
        this.debugConsoleManager.updateFaceXLog(snapshot.headPose.yawDeg);
        this.debugConsoleManager.updateFaceYLog(snapshot.headPose.pitchDeg);
        this.debugConsoleManager.updateFacing(snapshot.confidence);
        this.debugConsoleManager.updateCharacterGazeTargetDebug(this.formatSincroFaceDebug(snapshot));
        this.debugConsoleManager.updateSincroFaceMotion(snapshot);
    }

    private handleSincroPoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        if (!this.dialogManager.enableCharacterGaze() || this.dialogManager.talkMode() !== "sincro") {
            return;
        }
        this.characterBehaviorState.applyPoseMotion(snapshot);
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
        if (snapshot.degradedToFaceOnly || snapshot.fallbackReason) {
            this.debugConsoleManager.updateCharacterGazeTargetDebug(this.formatSincroPoseDebug(snapshot));
        }
    }

    private handleSincroPoseFallback(snapshot: SincroPoseMotionSnapshot): void {
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.characterBehaviorState.setErrorSource("poseMotion", null);
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
        this.debugConsoleManager.updateCharacterGazeTargetDebug(this.formatSincroPoseDebug(snapshot));
    }

    private handleCharacterGazeRuntimeError(error: unknown): void {
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setErrorSource(
            "gaze",
            `視線検出処理が停止しました。${this.formatErrorDetail(error)}`,
        );
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("検出エラー");
        this.updateEyeTargetOverlay(CharacterGaze.getManager(), false, []);
        this.chatMessageService.writeErrorMessage(
            `視線検出処理が停止しました。Gaze を一度OFF/ONするか、Firefoxでは別のカメラ設定を試してください。(${this.formatErrorDetail(error)})`,
        );
    }

    private handleSincroFaceRuntimeError(error: unknown): void {
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.characterBehaviorState.setErrorSource(
            "faceMotion",
            `顔同期トラッキングが停止しました。${this.formatErrorDetail(error)}`,
        );
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("FaceLandmarker エラー");
        this.chatMessageService.writeErrorMessage(
            `顔同期トラッキングが停止しました。face_landmarker.task の配置とカメラ設定を確認してください。(${this.formatErrorDetail(error)})`,
        );
    }

    private formatSincroFaceDebug(snapshot: SincroFaceMotionSnapshot): string {
        if (snapshot.fallbackReason) {
            return `sincro face: ${snapshot.fallbackReason}`;
        }
        return [
            `sincro face:${snapshot.detected ? "detected" : "lost"}`,
            `yaw:${snapshot.headPose.yawDeg.toFixed(1)}`,
            `pitch:${snapshot.headPose.pitchDeg.toFixed(1)}`,
            `roll:${snapshot.headPose.rollDeg.toFixed(1)}`,
            `infer:${snapshot.inferenceTimeMs.toFixed(1)}ms`,
            `fps:${snapshot.inferenceFps.toFixed(1)}`,
        ].join(" ");
    }

    private formatSincroPoseDebug(snapshot: SincroPoseMotionSnapshot): string {
        if (snapshot.degradedToFaceOnly) {
            return `sincro pose: face-only fallback (${snapshot.fallbackReason ?? "performance_gate"})`;
        }
        if (snapshot.fallbackReason) {
            return `sincro pose: ${snapshot.fallbackReason}`;
        }
        return [
            `sincro pose:${snapshot.detected ? "detected" : "lost"}`,
            `conf:${snapshot.confidence.toFixed(2)}`,
            `infer:${snapshot.inferenceTimeMs.toFixed(1)}ms`,
            `fps:${snapshot.inferenceFps.toFixed(1)}`,
        ].join(" ");
    }

    private formatErrorDetail(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }

    private readDialogGazeSettingsSnapshot(): DialogGazeSettingsSnapshot {
        return {
            enableCharacterGaze: this.dialogManager.enableCharacterGaze(),
            enableSincroPoseTracking: this.dialogManager.enableSincroPoseTracking(),
            videoInputDeviceId: this.dialogManager.videoInputDeviceId(),
            talkMode: this.dialogManager.talkMode(),
        };
    }

    private resolveTrackingVideoElement(): HTMLVideoElement {
        const trackingVideo = document.querySelector<HTMLVideoElement>("video#characterGazeVideo");
        if (!trackingVideo) {
            throw "video#characterGazeVideo is not found.";
        }
        return trackingVideo;
    }
}

type DialogGazeSettingsSnapshot = {
    enableCharacterGaze: boolean;
    enableSincroPoseTracking: boolean;
    videoInputDeviceId: string | null;
    talkMode: string;
};
