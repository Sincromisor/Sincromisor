import { createDebugConsoleAudioMeter } from "./debugConsoleAudioMeterFactory";
import {
    type RuntimeAudioConstraintApplyStatus,
    type RuntimeAudioConstraintKey,
    updateAudioConstraintStatus,
    updateAudioFilterConfig,
    updateAudioLearnedVadPerformanceMode,
    updateAudioLearnedVadReport,
    updateAudioLearnedVadStrictMode,
    updateAudioLearnedVadTuning,
    updateAudioVadRmsThreshold,
    updateAudioVadState,
    updateAudioVadThresholdMode,
} from "./debugConsoleAudioSnapshot";
import type {
    AudioFilterControlConfig,
    DebugConsoleManagerEvent,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
    LearnedVadUiReport,
    VadThresholdMode,
} from "./debugConsolePublicTypes";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type DebugConsoleAudioControlsParams = {
    readSnapshot: () => DebugConsoleSnapshot;
    updateSnapshot: (updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot) => void;
    emitEvent: (event: DebugConsoleManagerEvent) => void;
};

// DebugConsoleManager の音声診断操作をまとめる facade。
// manager 本体は既存 public API の入口に残し、callback 状態と snapshot 更新の詳細をここへ寄せる。
export class DebugConsoleAudioControls {
    private readonly localAudioConstraintApplyState: Partial<
        Record<RuntimeAudioConstraintKey, RuntimeAudioConstraintApplyStatus>
    > = {};
    private readonly audioMeter = createDebugConsoleAudioMeter({
        updateSnapshot: (updater) => this.params.updateSnapshot(updater),
        updateLocalVadState: (isSpeech) => this.updateLocalVadState(isSpeech),
    });
    private onLocalAudioFilterChange: (config: AudioFilterControlConfig) => void = () => {};
    private onLocalLearnedVadTuningChange: (config: LearnedVadTuningUiConfig) => void = () => {};
    private onLocalLearnedVadPerformanceModeChange: (mode: LearnedVadPerformanceMode) => void =
        () => {};
    private onLocalLearnedVadStrictModeChange: (enabled: boolean) => void = () => {};
    private onLocalVadThresholdModeChange: (mode: VadThresholdMode) => void = () => {};
    private onLocalVadRmsThresholdChange: (threshold: number) => void = () => {};

    constructor(private readonly params: DebugConsoleAudioControlsParams) {
        this.renderLocalAudioConstraintApplyStatus();
    }

    setLocalVadThresholdMode(mode: VadThresholdMode): void {
        this.params.updateSnapshot((snapshot) => updateAudioVadThresholdMode(snapshot, mode));
    }

    setLocalVadThresholdModeChangeCallback(callback: (mode: VadThresholdMode) => void): void {
        this.onLocalVadThresholdModeChange = callback;
    }

    applyLocalVadThresholdMode(mode: VadThresholdMode): void {
        this.setLocalVadThresholdMode(mode);
        this.onLocalVadThresholdModeChange(mode);
    }

    setLocalLearnedVadTuningChangeCallback(
        callback: (config: LearnedVadTuningUiConfig) => void,
    ): void {
        this.onLocalLearnedVadTuningChange = callback;
    }

    setLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.params.updateSnapshot((snapshot) => updateAudioLearnedVadTuning(snapshot, config));
    }

    applyLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.setLocalLearnedVadTuning(config);
        this.onLocalLearnedVadTuningChange(config);
    }

    setLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.params.updateSnapshot((snapshot) =>
            updateAudioLearnedVadPerformanceMode(snapshot, mode),
        );
    }

    setLocalLearnedVadPerformanceModeChangeCallback(
        callback: (mode: LearnedVadPerformanceMode) => void,
    ): void {
        this.onLocalLearnedVadPerformanceModeChange = callback;
    }

    applyLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.setLocalLearnedVadPerformanceMode(mode);
        this.onLocalLearnedVadPerformanceModeChange(mode);
    }

    setLocalLearnedVadStrictMode(enabled: boolean): void {
        this.params.updateSnapshot((snapshot) =>
            updateAudioLearnedVadStrictMode(snapshot, enabled),
        );
    }

    setLocalLearnedVadStrictModeChangeCallback(callback: (enabled: boolean) => void): void {
        this.onLocalLearnedVadStrictModeChange = callback;
    }

    applyLocalLearnedVadStrictMode(enabled: boolean): void {
        this.setLocalLearnedVadStrictMode(enabled);
        this.onLocalLearnedVadStrictModeChange(enabled);
    }

    setLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.params.updateSnapshot((snapshot) => updateAudioFilterConfig(snapshot, config));
    }

    setLocalAudioFilterChangeCallback(callback: (config: AudioFilterControlConfig) => void): void {
        this.onLocalAudioFilterChange = callback;
    }

    applyLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.setLocalAudioFilterConfig(config);
        this.onLocalAudioFilterChange(this.params.readSnapshot().audio.filterConfig);
    }

    setLocalVadRmsThreshold(value: number): void {
        this.params.updateSnapshot((snapshot) => updateAudioVadRmsThreshold(snapshot, value));
    }

    setLocalVadRmsThresholdChangeCallback(callback: (threshold: number) => void): void {
        this.onLocalVadRmsThresholdChange = callback;
    }

    applyLocalVadRmsThreshold(value: number): void {
        this.setLocalVadRmsThreshold(value);
        this.onLocalVadRmsThresholdChange(this.params.readSnapshot().audio.vadRmsThreshold);
    }

    updateLocalVadState(isSpeech: boolean): void {
        this.params.updateSnapshot((snapshot) => updateAudioVadState(snapshot, isSpeech));
        this.params.emitEvent({ type: "local_vad_state", isSpeech });
    }

    updateLearnedVadState(report: LearnedVadUiReport): void {
        this.params.updateSnapshot((snapshot) => updateAudioLearnedVadReport(snapshot, report));
        this.params.emitEvent({ type: "learned_vad_state", report });
    }

    updateLocalAudioConstraintApplyStatus(report: RuntimeAudioConstraintApplyStatus): void {
        this.localAudioConstraintApplyState[report.key] = report;
        this.renderLocalAudioConstraintApplyStatus();
    }

    setLocalAudioTrack(track: MediaStreamTrack): void {
        this.audioMeter.setLocalAudioTrack(track);
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        this.audioMeter.setRemoteAudioTrack(track);
    }

    private renderLocalAudioConstraintApplyStatus(): void {
        this.params.updateSnapshot((snapshot) =>
            updateAudioConstraintStatus(snapshot, this.localAudioConstraintApplyState),
        );
    }
}
