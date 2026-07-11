import type { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { SincroMotionObserveOnlyPipelineInput } from "../../character/runtime/sincroMotionObserveOnlyPipeline";
import { SincroMotionObserveOnlyPipeline } from "../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { DialogManager } from "../../features/dialog/model/dialogManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroGestureMotionSnapshot } from "../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import { toGestureIntentObservation } from "../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import type { SincroAppEvent } from "./sincroAppTypes";
import { SincroCameraQualityRuntime } from "./sincroCameraQualityRuntime";
import {
    formatErrorDetail,
    formatSincroFaceDebug,
    formatSincroPoseDebug,
} from "./sincroCharacterGazeDebugText";

type SincroCharacterMotionEventSinkOptions = {
    dialogManager: DialogManager;
    debugConsoleManager: DebugConsoleManager;
    chatMessageService: ChatMessageService;
    characterBehaviorState: CharacterBehaviorState;
    readVideoSize: () => { width: number; height: number };
    readTrackSettings: () => MediaTrackSettings | undefined;
    readTrackReadyState: () => MediaStreamTrackState | undefined;
    emitEvent: (event: SincroAppEvent) => void;
};

/** Camera / mode / tracking lifecycle の終了を AppController UI state へ通知する。 */
export function emitCameraQualityReset(emitEvent: (event: SincroAppEvent) => void): void {
    emitEvent({ type: "camera-quality-reset" });
}

export class SincroCharacterMotionEventSink {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private readonly observeOnlyPipeline = new SincroMotionObserveOnlyPipeline();
    private readonly cameraQualityRuntime = new SincroCameraQualityRuntime();
    private readonly readVideoSize: () => { width: number; height: number };
    private readonly readTrackSettings: () => MediaTrackSettings | undefined;
    private readonly readTrackReadyState: () => MediaStreamTrackState | undefined;
    private readonly emitEvent: (event: SincroAppEvent) => void;

    constructor(options: SincroCharacterMotionEventSinkOptions) {
        this.dialogManager = options.dialogManager;
        this.debugConsoleManager = options.debugConsoleManager;
        this.chatMessageService = options.chatMessageService;
        this.characterBehaviorState = options.characterBehaviorState;
        this.readVideoSize = options.readVideoSize;
        this.readTrackSettings = options.readTrackSettings;
        this.readTrackReadyState = options.readTrackReadyState;
        this.emitEvent = options.emitEvent;
    }

    handleFaceMotion(snapshot: SincroFaceMotionSnapshot, timing?: TrackerVideoFrameTiming): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        const observeOnly = this.observeOnlyPipeline.updateFace(
            snapshot,
            this.createObserveOnlyInput(timing),
        );
        this.characterBehaviorState.applySincroMotionPipelineState(observeOnly.state);
        this.characterBehaviorState.applyFaceMotion(snapshot);
        this.debugConsoleManager.updateCharacterEyeStatus(snapshot.detected);
        this.debugConsoleManager.updateFaceXLog(snapshot.headPose.yawDeg);
        this.debugConsoleManager.updateFaceYLog(snapshot.headPose.pitchDeg);
        this.debugConsoleManager.updateFacing(snapshot.confidence);
        this.debugConsoleManager.updateCharacterGazeTargetDebug(formatSincroFaceDebug(snapshot));
        this.debugConsoleManager.updateSincroFaceMotion(snapshot);
        this.debugConsoleManager.updateSincroObserveOnlySummary(observeOnly.summary);
    }

    handlePoseMotion(snapshot: SincroPoseMotionSnapshot, timing?: TrackerVideoFrameTiming): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        const video = this.readVideoSize();
        const quality = this.cameraQualityRuntime.updatePoseQuality({
            pose: snapshot,
            timing,
            video,
            trackSettings: this.readTrackSettings(),
            trackReadyState: this.readTrackReadyState(),
        });
        this.emitCameraQuality(quality, timing);
        const observeOnly = this.observeOnlyPipeline.updatePose(
            snapshot,
            this.createObserveOnlyInput(timing, video),
        );
        this.characterBehaviorState.applySincroMotionPipelineState(observeOnly.state);
        this.characterBehaviorState.applyPoseMotion(snapshot);
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
        this.debugConsoleManager.updateSincroObserveOnlySummary(observeOnly.summary);
        if (snapshot.degradedToFaceOnly || snapshot.fallbackReason) {
            this.debugConsoleManager.updateCharacterGazeTargetDebug(
                formatSincroPoseDebug(snapshot),
            );
        }
    }

    handlePoseFallback(snapshot: SincroPoseMotionSnapshot, timing?: TrackerVideoFrameTiming): void {
        const video = this.readVideoSize();
        const quality = this.cameraQualityRuntime.updatePoseQuality({
            pose: snapshot,
            timing,
            video,
            trackSettings: this.readTrackSettings(),
            trackReadyState: this.readTrackReadyState(),
        });
        this.emitCameraQuality(quality, timing);
        const observeOnly = this.observeOnlyPipeline.updatePose(
            snapshot,
            this.createObserveOnlyInput(timing, video),
        );
        this.characterBehaviorState.applySincroMotionPipelineState(observeOnly.state);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.characterBehaviorState.clearErrorSource("poseMotion");
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
        this.debugConsoleManager.updateSincroObserveOnlySummary(observeOnly.summary);
        this.debugConsoleManager.updateCharacterGazeTargetDebug(formatSincroPoseDebug(snapshot));
    }

    handleHandMotion(snapshot: SincroHandMotionSnapshot, timing?: TrackerVideoFrameTiming): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        const observeOnly = this.observeOnlyPipeline.updateHand(
            snapshot,
            this.createObserveOnlyInput(timing),
        );
        this.characterBehaviorState.applySincroMotionPipelineState(observeOnly.state);
        this.debugConsoleManager.updateSincroObserveOnlySummary(observeOnly.summary);
    }

    handleGestureMotion(
        snapshot: SincroGestureMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        const observeOnly = this.observeOnlyPipeline.updateGesture(
            snapshot,
            this.createObserveOnlyInput(timing, undefined, toGestureIntentObservation(snapshot)),
        );
        this.characterBehaviorState.applySincroMotionPipelineState(observeOnly.state);
        this.debugConsoleManager.updateSincroObserveOnlySummary(observeOnly.summary);
    }

    handleFaceRuntimeError(error: unknown): void {
        this.characterBehaviorState.setFaceMotionTrackingEnabled(false);
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.characterBehaviorState.setErrorSource(
            "faceMotion",
            `顔同期トラッキングが停止しました。${formatErrorDetail(error)}`,
        );
        this.debugConsoleManager.setCharacterGazePaused(true);
        this.debugConsoleManager.updateCharacterGazeTargetDebug("FaceLandmarker エラー");
        this.resetObserveOnlyPipeline();
        this.chatMessageService.writeErrorMessage(
            `顔同期トラッキングが停止しました。face_landmarker.task の配置とカメラ設定を確認してください。(${formatErrorDetail(error)})`,
        );
    }

    private isSincroTrackingEnabled(): boolean {
        return (
            this.dialogManager.enableCharacterGaze() && this.dialogManager.talkMode() === "sincro"
        );
    }

    /**
     * mode / camera / tracking lifecycle が切れた時に observe-only estimator memory を破棄する。
     *
     * Debug Console summary も reset 後の `not_computed` に同期するが、既存の face / pose retarget 表示や
     * VRM 適用済み姿勢はこの sink では変更しない。
     */
    resetObserveOnlyPipeline(): void {
        this.observeOnlyPipeline.reset();
        this.cameraQualityRuntime.reset();
        emitCameraQualityReset(this.emitEvent);
        this.characterBehaviorState.applySincroMotionPipelineState(
            this.observeOnlyPipeline.getState(),
        );
        this.debugConsoleManager.updateSincroObserveOnlySummary(
            this.observeOnlyPipeline.getSummary(),
        );
    }

    /**
     * Pose frame と同じ受信時刻を UI event に載せる。
     * reducer の clock を callback 到着後の render 時刻へ置き換えると hold 判定が端末負荷に左右されるため、
     * timing がある frame は必ず `receivedAtPerformanceMs` を引き継ぐ。
     */
    private emitCameraQuality(
        quality: CameraQualityScore | undefined,
        timing: TrackerVideoFrameTiming | undefined,
    ): void {
        if (quality === undefined) {
            return;
        }
        this.emitEvent({
            type: "camera-quality-changed",
            quality,
            observedAtMs: timing?.receivedAtPerformanceMs ?? performance.now(),
        });
    }

    private createObserveOnlyInput(
        timing: TrackerVideoFrameTiming | undefined,
        video: { width: number; height: number } | undefined = this.readVideoSize(),
        gesture?: SincroMotionObserveOnlyPipelineInput["gesture"],
    ): SincroMotionObserveOnlyPipelineInput {
        return {
            mediaTimeMs: timing?.mediaTimeMs,
            receivedAtMs: timing?.receivedAtPerformanceMs ?? performance.now(),
            video: video ?? this.readVideoSize(),
            gesture,
            cameraQuality: this.cameraQualityRuntime.getCameraQuality(),
        };
    }
}
