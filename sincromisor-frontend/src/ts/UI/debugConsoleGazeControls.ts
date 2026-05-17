import {
    updateGazeEyeStatus,
    updateGazeFaceX,
    updateGazeFaceY,
    updateGazeFacing,
    updateGazePaused,
    updateGazeTargetDebug,
    updateGazeTrackingTuning,
} from "./debugConsoleGazeSnapshot";
import type {
    CharacterGazeTrackingTuningUiConfig,
    DebugConsoleManagerEvent,
} from "./debugConsolePublicTypes";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type DebugConsoleGazeControlsParams = {
    updateSnapshot: (updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot) => void;
    emitEvent: (event: DebugConsoleManagerEvent) => void;
};

// Character Gaze 関連の診断 snapshot と legacy event をまとめる。
// face/facing/watching は複数 UI へ配信されるため、更新順をこの facade に固定する。
export class DebugConsoleGazeControls {
    private onCharacterGazeTrackingTuningChange: (
        config: CharacterGazeTrackingTuningUiConfig,
    ) => void = () => {};

    constructor(private readonly params: DebugConsoleGazeControlsParams) {}

    updateFaceXLog(value: number): void {
        this.params.updateSnapshot((snapshot) => updateGazeFaceX(snapshot, value));
        this.params.emitEvent({ type: "face_x", value });
    }

    updateFaceYLog(value: number): void {
        this.params.updateSnapshot((snapshot) => updateGazeFaceY(snapshot, value));
        this.params.emitEvent({ type: "face_y", value });
    }

    updateFacing(value: number): void {
        this.params.updateSnapshot((snapshot) => updateGazeFacing(snapshot, value));
        this.params.emitEvent({ type: "facing", value });
    }

    updateCharacterEyeStatus(watching: boolean): void {
        this.params.updateSnapshot((snapshot) => updateGazeEyeStatus(snapshot, watching));
        this.params.emitEvent({ type: "character_eye_status", watching });
    }

    updateCharacterGazeTargetDebug(message: string): void {
        this.params.updateSnapshot((snapshot) => updateGazeTargetDebug(snapshot, message));
        this.params.emitEvent({ type: "gaze_target_debug", message });
    }

    setCharacterGazePaused(paused: boolean): void {
        this.params.updateSnapshot((snapshot) => updateGazePaused(snapshot, paused));
    }

    setCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        this.params.updateSnapshot((snapshot) => updateGazeTrackingTuning(snapshot, config));
    }

    setCharacterGazeTrackingTuningChangeCallback(
        callback: (config: CharacterGazeTrackingTuningUiConfig) => void,
    ): void {
        this.onCharacterGazeTrackingTuningChange = callback;
    }

    applyCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        this.setCharacterGazeTrackingTuning(config);
        this.onCharacterGazeTrackingTuningChange(config);
    }
}
