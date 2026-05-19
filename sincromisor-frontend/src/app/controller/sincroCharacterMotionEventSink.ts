import type { CharacterBehaviorState } from "../../character/behavior/characterBehaviorState";
import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { DialogManager } from "../../features/dialog/model/dialogManager";
import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
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
};

export class SincroCharacterMotionEventSink {
    private readonly dialogManager: DialogManager;
    private readonly debugConsoleManager: DebugConsoleManager;
    private readonly chatMessageService: ChatMessageService;
    private readonly characterBehaviorState: CharacterBehaviorState;

    constructor(options: SincroCharacterMotionEventSinkOptions) {
        this.dialogManager = options.dialogManager;
        this.debugConsoleManager = options.debugConsoleManager;
        this.chatMessageService = options.chatMessageService;
        this.characterBehaviorState = options.characterBehaviorState;
    }

    handleFaceMotion(snapshot: SincroFaceMotionSnapshot): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        this.characterBehaviorState.applyFaceMotion(snapshot);
        this.debugConsoleManager.updateCharacterEyeStatus(snapshot.detected);
        this.debugConsoleManager.updateFaceXLog(snapshot.headPose.yawDeg);
        this.debugConsoleManager.updateFaceYLog(snapshot.headPose.pitchDeg);
        this.debugConsoleManager.updateFacing(snapshot.confidence);
        this.debugConsoleManager.updateCharacterGazeTargetDebug(formatSincroFaceDebug(snapshot));
        this.debugConsoleManager.updateSincroFaceMotion(snapshot);
    }

    handlePoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        if (!this.isSincroTrackingEnabled()) {
            return;
        }
        this.characterBehaviorState.applyPoseMotion(snapshot);
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
        if (snapshot.degradedToFaceOnly || snapshot.fallbackReason) {
            this.debugConsoleManager.updateCharacterGazeTargetDebug(
                formatSincroPoseDebug(snapshot),
            );
        }
    }

    handlePoseFallback(snapshot: SincroPoseMotionSnapshot): void {
        this.characterBehaviorState.setPoseMotionTrackingEnabled(false);
        this.characterBehaviorState.clearErrorSource("poseMotion");
        this.debugConsoleManager.updateSincroPoseMotion(snapshot);
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
        this.chatMessageService.writeErrorMessage(
            `顔同期トラッキングが停止しました。face_landmarker.task の配置とカメラ設定を確認してください。(${formatErrorDetail(error)})`,
        );
    }

    private isSincroTrackingEnabled(): boolean {
        return (
            this.dialogManager.enableCharacterGaze() && this.dialogManager.talkMode() === "sincro"
        );
    }
}
