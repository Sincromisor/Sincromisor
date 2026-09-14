import type { Detection } from "@mediapipe/tasks-vision";
import { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { InitialSincroCalibrationController } from "../../character/calibration/initialSincroCalibrationController";
import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { CharacterGaze } from "../../features/gaze/characterGaze/characterGaze";
import { TrackerRuntime } from "../../features/gaze/trackingRuntime/trackerRuntime";
import { VideoInputManager } from "../../features/media/userMedia/videoInputManager";
import { frontendLogger } from "../../shared/logging/appLogger";
import type { SincroAppSettingsModel } from "../settings/sincroAppSettingsModel";
import type { SincroAppEvent } from "./sincroAppTypes";
import { bindCharacterGazeCallbacks } from "./sincroCharacterGazeCallbacks";
import { formatErrorDetail } from "./sincroCharacterGazeDebugText";
import {
    hideEyeTargetOverlay,
    resolveTrackingVideoElement,
    updateEyeTargetOverlay,
} from "./sincroCharacterGazeOverlay";
import {
    compareGazeSettings,
    type GazeSettingsSnapshot,
    readGazeSettingsSnapshot,
    resetSincroMotionForGazeSettingsChanges,
} from "./sincroCharacterGazeSettings";
import { SincroCharacterMotionEventSink } from "./sincroCharacterMotionEventSink";

const SINCRO_POSE_TARGET_INFERENCE_FPS = 12;

/** カメラ取得と追跡世代を所有し、現在世代の観測と失敗だけをアプリ・較正へ届ける。 */
export class SincroCharacterGazeController {
    // reason: structure-threshold-exception 既存のカメラ・追跡ライフサイクルを維持し、追跡世代ごとの結果破棄とアプリへの中断通知を同じ所有者で扱う。
    private readonly settingsModel: SincroAppSettingsModel;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private readonly motionEventSink: SincroCharacterMotionEventSink;
    private readonly videoInputManager = new VideoInputManager();
    private readonly trackingVideoElement: HTMLVideoElement;
    private readonly trackerRuntime: TrackerRuntime;
    private released = false;
    private readonly unsubscribeSettings: () => void;
    private onTrackingStopped: (reason: string) => void = () => {};
    private onMuteChange: ((mute: boolean) => void) | undefined;
    private visionInitPromise: Promise<void> | undefined;
    private hasStarted = false;
    private gazeSettingsSnapshot: GazeSettingsSnapshot | undefined;
    private pendingCameraRefreshToken = 0;
    private cameraRefreshChain: Promise<void> = Promise.resolve();
    private activeTrackingVideoTrack?: MediaStreamTrack;

    constructor(
        settingsModel: SincroAppSettingsModel,
        debugConsoleManager: DebugConsoleManager,
        chatMessageService: ChatMessageService,
        emitEvent: (event: SincroAppEvent) => void,
        calibrationController: InitialSincroCalibrationController,
    ) {
        this.settingsModel = settingsModel;
        this.debugConsoleManager = debugConsoleManager;
        this.chatMessageService = chatMessageService;
        this.characterBehaviorState = CharacterBehaviorState.getManager();
        this.trackingVideoElement = resolveTrackingVideoElement();
        this.motionEventSink = new SincroCharacterMotionEventSink({
            calibrationController,
            settingsModel,
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
        // 診断モデルの初期値または復元値を接続時に受け取り、古い実行時値で上書きしない。
        this.debugConsoleManager.setCharacterGazeTrackingTuningChangeCallback((config) => {
            characterGaze.setTrackingTuning(config);
        });
        // Gaze ON/OFF と camera selector の両方に追従できるよう、設定変更は差分監視で扱う。
        this.unsubscribeSettings = this.settingsModel.subscribeSettingsChange(() => {
            this.applyGazeSettings(false);
        });
    }

    /** 開始ごとの終了通知を保持し、視線・AutoMuteと顔・姿勢追跡へ現在設定を反映する。 */
    start(
        onMuteChange: (mute: boolean) => void,
        onTrackingStopped: (reason: string) => void,
    ): void {
        if (this.released) return;
        this.onTrackingStopped = onTrackingStopped;
        this.onMuteChange = onMuteChange;
        this.hasStarted = true;

        const characterGaze = CharacterGaze.getManager();
        bindCharacterGazeCallbacks({
            characterGaze,
            debugConsoleManager: this.debugConsoleManager,
            settingsModel: this.settingsModel,
            onMuteChange,
        });
        this.applyGazeSettings(true);
    }

    // 通常設定から視線処理へ必要な差分だけを反映する。
    private applyGazeSettings(forceAll: boolean): void {
        const next = readGazeSettingsSnapshot(this.settingsModel);
        const changes = compareGazeSettings(this.gazeSettingsSnapshot, next, forceAll);

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

    /** 停止以後の遅延結果を無効にし、同じ開始の較正へ追跡終了を返す。 */
    private stopCharacterGazeCamera(): void {
        ++this.pendingCameraRefreshToken;
        this.onTrackingStopped("tracking_stopped");
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
        const onTrackingStopped = this.onTrackingStopped;
        this.cameraRefreshChain = this.cameraRefreshChain
            .catch(() => {
                // 直前の切替失敗で後続チェーンが止まらないようにする。
            })
            .then(async () => {
                if (this.released || refreshToken !== this.pendingCameraRefreshToken) {
                    return;
                }
                await this.refreshCharacterGazeCamera(refreshToken, onTrackingStopped);
            });
    }

    /** 最新の機器を取得し、現在の会話モードの追跡を開始する。古い取得結果は停止して破棄する。 */
    private async refreshCharacterGazeCamera(
        refreshToken: number,
        onTrackingStopped: (reason: string) => void,
    ): Promise<void> {
        if (!this.isCurrentTracking(refreshToken) || this.onMuteChange === undefined) {
            return;
        }
        this.motionEventSink.resetObserveOnlyPipeline();
        const characterGaze = CharacterGaze.getManager();
        bindCharacterGazeCallbacks({
            characterGaze,
            debugConsoleManager: this.debugConsoleManager,
            settingsModel: this.settingsModel,
            onMuteChange: this.onMuteChange,
        });
        this.debugConsoleManager.setCharacterGazePaused(false);
        this.characterBehaviorState.setGazeTrackingEnabled(false);
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);

        try {
            const nextVideoTrack = await this.videoInputManager.reacquireVideoTrack();
            if (!this.isCurrentTracking(refreshToken)) {
                nextVideoTrack.stop();
                return;
            }
            this.activeTrackingVideoTrack = nextVideoTrack;
            nextVideoTrack.addEventListener("ended", () => {
                if (
                    !this.isCurrentTracking(refreshToken) ||
                    this.activeTrackingVideoTrack !== nextVideoTrack
                ) {
                    return;
                }
                onTrackingStopped("camera_ended");
                this.characterBehaviorState.setErrorSource(
                    "gaze",
                    "顔トラッキング用カメラの映像トラックが停止しました。",
                );
            });

            if (this.settingsModel.getSetting("talkMode") === "sincro") {
                await this.startSincroFaceTracking(nextVideoTrack, refreshToken, onTrackingStopped);
            } else {
                await this.startCharacterGazeTracking(
                    characterGaze,
                    nextVideoTrack,
                    refreshToken,
                    onTrackingStopped,
                );
            }
            if (!this.isCurrentTracking(refreshToken)) return;
            this.characterBehaviorState.clearErrorSource("gaze");
            this.characterBehaviorState.clearErrorSource("faceMotion");
        } catch (error) {
            if (this.released || refreshToken !== this.pendingCameraRefreshToken) {
                return;
            }
            frontendLogger.error("Failed to init CharacterGaze camera.", { error });
            onTrackingStopped("tracking_failed");
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
        refreshToken: number,
        onTrackingStopped: (reason: string) => void,
    ): Promise<void> {
        this.trackerRuntime.stopFaceTracking("chat_mode_selected");
        this.motionEventSink.resetObserveOnlyPipeline();
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        await this.ensureVisionInitialized(characterGaze);
        if (!this.isCurrentTracking(refreshToken)) return;
        frontendLogger.info("Starting CharacterGaze tracking.");
        const started = await characterGaze.initCamera(
            nextVideoTrack,
            (detects: Detection[]) => {
                if (!this.isCurrentTracking(refreshToken)) return;
                // 設定変更後も動作が追従するよう、毎フレーム時点の設定を参照する。
                const gazeEnabled =
                    this.settingsModel.getSetting("enableCharacterGaze") &&
                    this.settingsModel.getSetting("talkMode") !== "sincro";
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
                if (!this.isCurrentTracking(refreshToken)) return;
                onTrackingStopped("tracking_failed");
                this.handleCharacterGazeRuntimeError(error);
            },
        );
        if (!started) {
            throw new Error("CharacterGaze camera initialization returned false.");
        }
        if (this.isCurrentTracking(refreshToken))
            this.characterBehaviorState.setGazeTrackingEnabled(true);
    }

    /** 視線追跡を解除し、現在の姿勢設定で顔・姿勢同期を開始する。姿勢無効時は補助追跡も起動しない。 */
    private async startSincroFaceTracking(
        nextVideoTrack: MediaStreamTrack,
        refreshToken: number,
        onTrackingStopped: (reason: string) => void,
    ): Promise<void> {
        const characterGaze = CharacterGaze.getManager();
        characterGaze.detachCamera();
        updateEyeTargetOverlay(characterGaze, false, []);
        this.motionEventSink.resetObserveOnlyPipeline();
        const poseTrackingEnabled = this.settingsModel.getSetting("enableSincroPoseTracking");
        const forcePoseTracking = this.settingsModel.getSetting("forceSincroPoseTracking");
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
                    if (!this.isCurrentTracking(refreshToken)) return;
                    this.motionEventSink.handleFaceMotion(snapshot, timing);
                },
                onPoseMotion: (snapshot, timing) => {
                    if (!this.isCurrentTracking(refreshToken)) return;
                    this.motionEventSink.handlePoseMotion(snapshot, timing);
                },
                onPoseFallback: (snapshot, timing) => {
                    if (!this.isCurrentTracking(refreshToken)) return;
                    this.motionEventSink.handlePoseFallback(snapshot, timing);
                },
                onHandMotion: (snapshot, timing) => {
                    if (!this.isCurrentTracking(refreshToken)) return;
                    this.motionEventSink.handleHandMotion(snapshot, timing);
                },
                onGestureMotion: (snapshot, timing) => {
                    if (!this.isCurrentTracking(refreshToken)) return;
                    this.motionEventSink.handleGestureMotion(snapshot, timing);
                },
                onTrackerStats: (snapshot) => {
                    if (!this.isCurrentTracking(refreshToken)) return;
                    this.debugConsoleManager.updateSincroTrackerStats(snapshot);
                },
                onError: (error) => {
                    if (!this.isCurrentTracking(refreshToken)) return;
                    onTrackingStopped("tracking_failed");
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

    /** アプリ差し替えで購読と結果の反映を終了する。機器停止は既存の操作範囲に残す。 */
    releaseSubscriptions(): void {
        this.released = true;
        ++this.pendingCameraRefreshToken;
        this.unsubscribeSettings();
    }

    /** 機器取得・追跡初期化・毎フレーム通知を同じ開始世代で検査する。 */
    private isCurrentTracking(refreshToken: number): boolean {
        return (
            !this.released &&
            refreshToken === this.pendingCameraRefreshToken &&
            this.settingsModel.getSetting("enableCharacterGaze")
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
