import type { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { SincroMotionObserveOnlyPipelineInput } from "../../character/runtime/sincroMotionObserveOnlyPipeline";
import { SincroMotionObserveOnlyPipeline } from "../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { DialogManager } from "../../features/dialog/model/dialogManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";
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
};

export class SincroCharacterMotionEventSink {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;
    private readonly observeOnlyPipeline = new SincroMotionObserveOnlyPipeline();
    private readonly readVideoSize: () => { width: number; height: number };

    constructor(options: SincroCharacterMotionEventSinkOptions) {
        this.dialogManager = options.dialogManager;
        this.debugConsoleManager = options.debugConsoleManager;
        this.chatMessageService = options.chatMessageService;
        this.characterBehaviorState = options.characterBehaviorState;
        this.readVideoSize = options.readVideoSize;
    }

    handleFaceMotion(snapshot: SincroFaceMotionSnapshot, timing?: TrackerVideoFrameTiming): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        const observeOnly = this.observeOnlyPipeline.updateFace(
            snapshot,
            this.createObserveOnlyInput(timing),
        );
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
        const observeOnly = this.observeOnlyPipeline.updatePose(
            snapshot,
            this.createObserveOnlyInput(timing),
        );
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
        const observeOnly = this.observeOnlyPipeline.updatePose(
            snapshot,
            this.createObserveOnlyInput(timing),
        );
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.characterBehaviorState.clearErrorSource("poseMotion");
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
        this.debugConsoleManager.updateSincroObserveOnlySummary(observeOnly.summary);
        this.debugConsoleManager.updateCharacterGazeTargetDebug(formatSincroPoseDebug(snapshot));
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
        this.debugConsoleManager.updateSincroObserveOnlySummary(
            this.observeOnlyPipeline.getSummary(),
        );
    }

    private createObserveOnlyInput(
        timing: TrackerVideoFrameTiming | undefined,
    ): SincroMotionObserveOnlyPipelineInput {
        return {
            mediaTimeMs: timing?.mediaTimeMs,
            receivedAtMs: timing?.receivedAtPerformanceMs ?? performance.now(),
            video: this.readVideoSize(),
        };
    }
}
