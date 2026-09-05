import type { Detection } from "@mediapipe/tasks-vision";
import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { DialogManager } from "../../features/dialog/model/dialogManager";
import { CharacterGaze } from "../../features/gaze/characterGaze/characterGaze";
import { TrackerRuntime } from "../../features/gaze/trackingRuntime/trackerRuntime";
import { VideoInputManager } from "../../features/media/userMedia/videoInputManager";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroAppEvent } from "./sincroAppTypes";
import { bindCharacterGazeCallbacks } from "./sincroCharacterGazeCallbacks";
import { formatErrorDetail } from "./sincroCharacterGazeDebugText";
import {
    hideEyeTargetOverlay,
    resolveTrackingVideoElement,
    updateEyeTargetOverlay,
} from "./sincroCharacterGazeOverlay";
import {
    compareDialogGazeSettings,
    type DialogGazeSettingsSnapshot,
    readDialogGazeSettingsSnapshot,
    resetSincroMotionForGazeSettingsChanges,
} from "./sincroCharacterGazeSettings";
import { SincroCharacterMotionEventSink } from "./sincroCharacterMotionEventSink";

const SINCRO_POSE_TARGET_INFERENCE_FPS = 12;

// CharacterGaze の起動と、視線検出結果 -> Debug UI / AutoMute 変換を担当する controller。
// DOM依存（#eyeTarget 表示）は移行期間の暫定としてここに閉じ込めている。
export class SincroCharacterGazeController {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private readonly motionEventSink: SincroCharacterMotionEventSink;
    private readonly videoInputManager = new VideoInputManager();
    private readonly trackingVideoElement: HTMLVideoElement;
    private readonly trackerRuntime: TrackerRuntime;
    private onMuteChange: ((mute: boolean) => void) | undefined;
    private visionInitPromise: Promise<void> | undefined;
    private hasStarted = false;
    private gazeSettingsSnapshot: DialogGazeSettingsSnapshot | undefined;
    private pendingCameraRefreshToken = 0;
    private cameraRefreshChain: Promise<void> = Promise.resolve();
    private activeTrackingVideoTrack?: MediaStreamTrack;

    constructor(
        dialogManager: DialogManager,
        debugConsoleManager: DebugConsoleManager,
        chatMessageService: ChatMessageService,
        emitEvent: (event: SincroAppEvent) => void,
    ) {
        this.dialogManager = dialogManager;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageService = chatMessageService;
        this.characterBehaviorState = CharacterBehaviorState.getManager();
        this.trackingVideoElement = resolveTrackingVideoElement();
        this.motionEventSink = new SincroCharacterMotionEventSink({
            dialogManager,
            debugConsoleManager,
            chatMessageService,
            characterBehaviorState: this.characterBehaviorState,
            readVideoSize: () => this.readTrackingVideoSize(),
            readTrackSettings: () => this.readTrackingTrackSettings(),
            readTrackReadyState: () => this.readTrackingTrackReadyState(),
            emitEvent,
        });
        this.trackerRuntime = new TrackerRuntime(this.trackingVideoElement);
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
        bindCharacterGazeCallbacks({
            characterGaze,
            debugConsoleManager: this.debugConsoleManager,
            dialogManager: this.dialogManager,
            onMuteChange,
        });
        this.applyDialogGazeSettings(true);
    }

    // Dialog 設定から Gaze runtime へ必要な差分だけを反映する。
    private applyDialogGazeSettings(forceAll: boolean): void {
        const next = readDialogGazeSettingsSnapshot(this.dialogManager);
        const changes = compareDialogGazeSettings(this.gazeSettingsSnapshot, next, forceAll);

        this.characterBehaviorState.setTalkMode(next.talkMode);
        if (changes.videoDeviceChanged) {
            this.videoInputManager.setVideoInputDeviceId(next.videoInputDeviceId);
        }
        this.gazeSettingsSnapshot = next;
        resetSincroMotionForGazeSettingsChanges(changes, () =>
            this.motionEventSink.resetObserveOnlyPipeline(),
        );

        if (!this.hasStarted || this.onMuteChange === undefined) {
            return;
        }

        if (!next.enableCharacterGaze) {
            if (changes.gazeEnabledChanged || changes.videoDeviceChanged) {
                this.stopCharacterGazeCamera();
            }
            return;
        }
        if (
            changes.gazeEnabledChanged ||
            changes.videoDeviceChanged ||
            changes.talkModeChanged ||
            changes.poseTrackingChanged ||
            changes.forcePoseTrackingChanged
        ) {
            this.scheduleCameraRefresh();
        }
    }

    private stopCharacterGazeCamera(): void {
        const characterGaze = CharacterGaze.getManager();
        characterGaze.detachCamera();
        this.trackerRuntime.stopFaceTracking("sincro_face_tracking_stopped");
        this.motionEventSink.resetObserveOnlyPipeline();
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.activeTrackingVideoTrack = undefined;
        this.videoInputManager.releaseVideoTrack();
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("停止中");
        hideEyeTargetOverlay();
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

    /** 最新の機器を取得し、現在の会話モードの追跡を開始する。古い取得結果は停止して破棄する。 */
    private async refreshCharacterGazeCamera(refreshToken: number): Promise<void> {
        if (
            !this.dialogManager.getSetting("enableCharacterGaze") ||
            this.onMuteChange === undefined
        ) {
            return;
        }
        this.motionEventSink.resetObserveOnlyPipeline();
        const characterGaze = CharacterGaze.getManager();
        bindCharacterGazeCallbacks({
            characterGaze,
            debugConsoleManager: this.debugConsoleManager,
            dialogManager: this.dialogManager,
            onMuteChange: this.onMuteChange,
        });
        this.debugConsoleManager.setCharacterGazePaused(false);
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);

        try {
            const nextVideoTrack = await this.videoInputManager.reacquireVideoTrack();
            if (
                refreshToken !== this.pendingCameraRefreshToken ||
                !this.dialogManager.getSetting("enableCharacterGaze")
            ) {
                nextVideoTrack.stop();
                return;
            }
            this.activeTrackingVideoTrack = nextVideoTrack;
            nextVideoTrack.addEventListener("ended", () => {
                if (!this.dialogManager.getSetting("enableCharacterGaze")) {
                    return;
                }
                this.characterBehaviorState.setErrorSource(
                    "gaze",
                    "顔トラッキング用カメラの映像トラックが停止しました。",
                );
            });

            if (this.dialogManager.getSetting("talkMode") === "sincro") {
                await this.startSincroFaceTracking(nextVideoTrack);
            } else {
                await this.startCharacterGazeTracking(characterGaze, nextVideoTrack);
            }
            this.characterBehaviorState.clearErrorSource("gaze");
            this.characterBehaviorState.clearErrorSource("faceMotion");
        } catch (error) {
            if (refreshToken !== this.pendingCameraRefreshToken) {
                return;
            }
            frontendLogger.error("Failed to init CharacterGaze camera.", { error });
            this.stopCharacterGazeCamera();
            const detail = error instanceof Error ? error.message : String(error);
            this.characterBehaviorState.setErrorSource(
                "gaze",
                `顔トラッキング用カメラへの切替に失敗しました。${detail}`,
            );
            const selectedDeviceId = this.videoInputManager.getVideoInputDeviceId();
            const deviceLabel = selectedDeviceId ? `deviceId=${selectedDeviceId}` : "既定デバイス";
            this.chatMessageService.writeErrorMessage(
                `選択した顔トラッキング用カメラへの切替に失敗しました。(${deviceLabel}) - ${detail}`,
            );
        }
    }

    /** 顔同期を停止して視線追跡を開始する。各フレームで現在の設定を確認して結果の適用を決める。 */
    private async startCharacterGazeTracking(
        characterGaze: CharacterGaze,
        nextVideoTrack: MediaStreamTrack,
    ): Promise<void> {
        this.trackerRuntime.stopFaceTracking("chat_mode_selected");
        this.motionEventSink.resetObserveOnlyPipeline();
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        await this.ensureVisionInitialized(characterGaze);
        frontendLogger.info("Starting CharacterGaze tracking.");
        const started = await characterGaze.initCamera(
            nextVideoTrack,
            (detects: Detection[]) => {
                // 設定変更後も動作が追従するよう、毎フレーム時点の設定を参照する。
                const gazeEnabled =
                    this.dialogManager.getSetting("enableCharacterGaze") &&
                    this.dialogManager.getSetting("talkMode") !== "sincro";
                // ここが Gaze 状態の主更新点。DebugConsole購読経由で React 側にも値が流れる。
                if (gazeEnabled) {
                    this.debugConsoleManager.updateFaceXLog(characterGaze.targetX());
                    this.debugConsoleManager.updateFaceYLog(characterGaze.targetY());
                    this.debugConsoleManager.updateFacing(characterGaze.facing());
                    this.debugConsoleManager.updateCharacterGazeTargetDebug(
                        characterGaze.targetSelectionDebugText(),
                    );
                    this.characterBehaviorState.applyGazeState(characterGaze, detects);
                }
                updateEyeTargetOverlay(characterGaze, gazeEnabled, detects);
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

    /** 視線追跡を解除し、現在の姿勢設定で顔・姿勢同期を開始する。姿勢無効時は補助追跡も起動しない。 */
    private async startSincroFaceTracking(nextVideoTrack: MediaStreamTrack): Promise<void> {
        const characterGaze = CharacterGaze.getManager();
        characterGaze.detachCamera();
        updateEyeTargetOverlay(characterGaze, false, []);
        this.motionEventSink.resetObserveOnlyPipeline();
        const poseTrackingEnabled = this.dialogManager.getSetting("enableSincroPoseTracking");
        const forcePoseTracking = this.dialogManager.getSetting("forceSincroPoseTracking");
        const observeOptionalPosePassEnabled = poseTrackingEnabled;
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(true);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(poseTrackingEnabled);
        frontendLogger.info("Starting Sincro face tracker.", {
            poseTrackingEnabled,
            forcePoseTracking,
        });
        await this.trackerRuntime.startFaceTracking(
            nextVideoTrack,
            {
                onFaceMotion: (snapshot, timing) => {
                    this.motionEventSink.handleFaceMotion(snapshot, timing);
                },
                onPoseMotion: (snapshot, timing) => {
                    this.motionEventSink.handlePoseMotion(snapshot, timing);
                },
                onPoseFallback: (snapshot, timing) => {
                    this.motionEventSink.handlePoseFallback(snapshot, timing);
                },
                onHandMotion: (snapshot, timing) => {
                    this.motionEventSink.handleHandMotion(snapshot, timing);
                },
                onGestureMotion: (snapshot, timing) => {
                    this.motionEventSink.handleGestureMotion(snapshot, timing);
                },
                onTrackerStats: (snapshot) => {
                    this.debugConsoleManager.updateSincroTrackerStats(snapshot);
                },
                onError: (error) => {
                    this.motionEventSink.handleFaceRuntimeError(error);
                },
            },
            undefined,
            {
                enabled: poseTrackingEnabled,
                targetInferenceFps: SINCRO_POSE_TARGET_INFERENCE_FPS,
                ignorePerformanceFallback: forcePoseTracking,
                // Hand / Gesture / Face ROI は production sincro の observe-only 入力であり、Pose が無効なら起動しない。
                hand: { enabled: observeOptionalPosePassEnabled },
                gesture: { enabled: observeOptionalPosePassEnabled },
                faceRoi: { enabled: observeOptionalPosePassEnabled },
            },
        );
    }

    private ensureVisionInitialized(characterGaze: CharacterGaze): Promise<void> {
        if (characterGaze.modelIsLoaded()) {
            return Promise.resolve();
        }
        if (this.visionInitPromise === undefined) {
            this.visionInitPromise = characterGaze.initVision().catch((error) => {
                this.visionInitPromise = undefined;
                throw error;
            });
        }
        return this.visionInitPromise;
    }

    private handleCharacterGazeRuntimeError(error: unknown): void {
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setErrorSource(
            "gaze",
            `視線検出処理が停止しました。${formatErrorDetail(error)}`,
        );
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("検出エラー");
        updateEyeTargetOverlay(CharacterGaze.getManager(), false, []);
        this.chatMessageService.writeErrorMessage(
            `視線検出処理が停止しました。Gaze を一度OFF/ONするか、Firefoxでは別のカメラ設定を試してください。(${formatErrorDetail(error)})`,
        );
    }

    private readTrackingVideoSize(): { width: number; height: number } {
        return {
            width:
                this.trackingVideoElement.videoWidth || this.trackingVideoElement.clientWidth || 1,
            height:
                this.trackingVideoElement.videoHeight ||
                this.trackingVideoElement.clientHeight ||
                1,
        };
    }

    private readTrackingTrackSettings(): MediaTrackSettings | undefined {
        return this.activeTrackingVideoTrack?.getSettings();
    }

    private readTrackingTrackReadyState(): MediaStreamTrackState | undefined {
        return this.activeTrackingVideoTrack?.readyState;
    }
}
