import type { MinimalAvatarMotionProfile } from "../../../character/avatarProfile/minimalAvatarMotionProfile";
import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../../../character/retargeting/sincroPoseRetargeter";
import type {
    SincroMotionComposerDryRunSummary,
    SincroMotionObserveOnlySummary,
} from "../../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { SincroVrmPoseComposerDryRunResult } from "../../../character/runtime/sincroVrmPoseComposerDryRun";
import type { SincroFaceMotionSnapshot } from "../../gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../gaze/trackingRuntime/sincroTrackerWorkerTypes";
import { DebugConsoleAudioControls } from "./debugConsoleAudioControls";
import type { RuntimeAudioConstraintApplyStatus } from "./debugConsoleAudioSnapshot";
import { DebugConsoleEventHub } from "./debugConsoleEventHub";
import { DebugConsoleGazeControls } from "./debugConsoleGazeControls";
import type {
    AudioFilterControlConfig,
    CharacterGazeTrackingTuningUiConfig,
    DebugConsoleManagerEvent,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
    LearnedVadUiReport,
    VadThresholdMode,
} from "./debugConsolePublicTypes";
import { DebugConsoleRtcControls } from "./debugConsoleRtcControls";
import { DebugConsoleSincroMotionControls } from "./debugConsoleSincroMotionControls";
import { createDefaultSnapshot, type DebugConsoleSnapshot } from "./debugConsoleSnapshot";

export type {
    AudioFilterControlConfig,
    CharacterGazeTrackingTuningPresetKey,
    CharacterGazeTrackingTuningUiConfig,
    DebugConsoleManagerEvent,
    DebugConsoleMetricKey,
    DebugConsoleTrendKey,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
    LearnedVadUiReport,
    VadThresholdMode,
} from "./debugConsolePublicTypes";
export {
    CHARACTER_GAZE_TRACKING_TUNING_PRESETS,
    DEBUG_CONSOLE_TREND_MAX_VALUES,
} from "./debugConsolePublicTypes";
export type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

// DOM 主導だった旧 Debug Console を、React view が購読する診断 snapshot 供給元へ縮退する。
// 既存 public API は維持し、RTC / Audio / Gaze 側からの呼び出し先は変えずに移行を進める。
export class DebugConsoleManager {
    private static instance: DebugConsoleManager;

    private snapshot: DebugConsoleSnapshot = createDefaultSnapshot();
    private readonly eventHub = new DebugConsoleEventHub();
    private readonly audioControls = new DebugConsoleAudioControls({
        readSnapshot: () => this.snapshot,
        updateSnapshot: (updater) => this.updateSnapshot(updater),
        emitEvent: (event) => this.emitEvent(event),
    });
    private readonly sincroMotionControls = new DebugConsoleSincroMotionControls({
        readSnapshot: () => this.snapshot,
        updateSnapshot: (updater) => this.updateSnapshot(updater),
    });
    private readonly rtcControls = new DebugConsoleRtcControls({
        updateSnapshot: (updater) => this.updateSnapshot(updater),
        emitEvent: (event) => this.emitEvent(event),
    });
    private readonly gazeControls = new DebugConsoleGazeControls({
        updateSnapshot: (updater) => this.updateSnapshot(updater),
        emitEvent: (event) => this.emitEvent(event),
    });
    private rtcStopHandler: () => void = () => {};

    static getManager(): DebugConsoleManager {
        if (!DebugConsoleManager.instance) {
            DebugConsoleManager.instance = new DebugConsoleManager();
        }
        return DebugConsoleManager.instance;
    }

    private constructor() {}

    subscribe(listener: (event: DebugConsoleManagerEvent) => void): () => void {
        return this.eventHub.subscribeEvent(listener);
    }

    subscribeSnapshot(listener: () => void): () => void {
        return this.eventHub.subscribeSnapshot(listener);
    }

    getSnapshot(): DebugConsoleSnapshot {
        return this.snapshot;
    }

    setRTCStopButtonEventListener(stopFunction: () => void): void {
        this.rtcStopHandler = stopFunction;
    }

    requestRtcStop(): void {
        this.rtcStopHandler();
    }

    setLocalVadThresholdMode(mode: VadThresholdMode): void {
        this.audioControls.setLocalVadThresholdMode(mode);
    }

    setLocalVadThresholdModeChangeCallback(callback: (mode: VadThresholdMode) => void): void {
        this.audioControls.setLocalVadThresholdModeChangeCallback(callback);
    }

    applyLocalVadThresholdMode(mode: VadThresholdMode): void {
        this.audioControls.applyLocalVadThresholdMode(mode);
    }

    setLocalLearnedVadTuningChangeCallback(
        callback: (config: LearnedVadTuningUiConfig) => void,
    ): void {
        this.audioControls.setLocalLearnedVadTuningChangeCallback(callback);
    }

    setLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.audioControls.setLocalLearnedVadTuning(config);
    }

    applyLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.audioControls.applyLocalLearnedVadTuning(config);
    }

    setLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.audioControls.setLocalLearnedVadPerformanceMode(mode);
    }

    setLocalLearnedVadPerformanceModeChangeCallback(
        callback: (mode: LearnedVadPerformanceMode) => void,
    ): void {
        this.audioControls.setLocalLearnedVadPerformanceModeChangeCallback(callback);
    }

    applyLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.audioControls.applyLocalLearnedVadPerformanceMode(mode);
    }

    setLocalLearnedVadStrictMode(enabled: boolean): void {
        this.audioControls.setLocalLearnedVadStrictMode(enabled);
    }

    setLocalLearnedVadStrictModeChangeCallback(callback: (enabled: boolean) => void): void {
        this.audioControls.setLocalLearnedVadStrictModeChangeCallback(callback);
    }

    applyLocalLearnedVadStrictMode(enabled: boolean): void {
        this.audioControls.applyLocalLearnedVadStrictMode(enabled);
    }

    setLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.audioControls.setLocalAudioFilterConfig(config);
    }

    setLocalAudioFilterChangeCallback(callback: (config: AudioFilterControlConfig) => void): void {
        this.audioControls.setLocalAudioFilterChangeCallback(callback);
    }

    applyLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.audioControls.applyLocalAudioFilterConfig(config);
    }

    setLocalVadRmsThreshold(value: number): void {
        this.audioControls.setLocalVadRmsThreshold(value);
    }

    setLocalVadRmsThresholdChangeCallback(callback: (threshold: number) => void): void {
        this.audioControls.setLocalVadRmsThresholdChangeCallback(callback);
    }

    applyLocalVadRmsThreshold(value: number): void {
        this.audioControls.applyLocalVadRmsThreshold(value);
    }

    updateLocalVadState(isSpeech: boolean): void {
        this.audioControls.updateLocalVadState(isSpeech);
    }

    updateLearnedVadState(report: LearnedVadUiReport): void {
        this.audioControls.updateLearnedVadState(report);
    }

    updateLocalAudioConstraintApplyStatus(report: RuntimeAudioConstraintApplyStatus): void {
        this.audioControls.updateLocalAudioConstraintApplyStatus(report);
    }

    setLocalAudioTrack(track: MediaStreamTrack): void {
        this.audioControls.setLocalAudioTrack(track);
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        this.audioControls.setRemoteAudioTrack(track);
    }

    resetRealtimeStats(): void {
        this.rtcControls.resetRealtimeStats();
    }

    updateMetricValue(key: string, value: string): void {
        this.rtcControls.updateMetricValue(key, value);
    }

    pushTrendPoint(trendKey: string, value: number | undefined): void {
        this.rtcControls.pushTrendPoint(trendKey, value);
    }

    addRtcEventLog(msg: string): void {
        this.rtcControls.addRtcEventLog(msg);
    }

    addTelopChannelLog(msg: string): void {
        this.rtcControls.addTelopChannelLog(msg);
    }

    addTextChannelLog(msg: string): void {
        this.rtcControls.addTextChannelLog(msg);
    }

    newIceConnectionState(msg: string): void {
        this.rtcControls.newIceConnectionState(msg);
    }

    updateIceConnectionState(msg: string): void {
        this.rtcControls.updateIceConnectionState(msg);
    }

    newIceGatheringState(msg: string): void {
        this.rtcControls.newIceGatheringState(msg);
    }

    updateIceGatheringState(msg: string): void {
        this.rtcControls.updateIceGatheringState(msg);
    }

    newSignalingState(msg: string): void {
        this.rtcControls.newSignalingState(msg);
    }

    updateSignalingState(msg: string): void {
        this.rtcControls.updateSignalingState(msg);
    }

    offerSDP(msg: string): void {
        this.rtcControls.offerSDP(msg);
    }

    answerSDP(msg: string): void {
        this.rtcControls.answerSDP(msg);
    }

    updateFaceXLog(value: number): void {
        this.gazeControls.updateFaceXLog(value);
    }

    updateFaceYLog(value: number): void {
        this.gazeControls.updateFaceYLog(value);
    }

    updateFacing(value: number): void {
        this.gazeControls.updateFacing(value);
    }

    updateCharacterEyeStatus(watching: boolean): void {
        this.gazeControls.updateCharacterEyeStatus(watching);
    }

    updateCharacterGazeTargetDebug(message: string): void {
        this.gazeControls.updateCharacterGazeTargetDebug(message);
    }

    updateSincroFaceMotion(snapshot: SincroFaceMotionSnapshot): void {
        this.sincroMotionControls.updateSincroFaceMotion(snapshot);
    }

    updateSincroPoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        this.sincroMotionControls.updateSincroPoseMotion(snapshot);
    }

    updateSincroTrackerStats(snapshot: SincroTrackerWorkerStats): void {
        this.sincroMotionControls.updateSincroTrackerStats(snapshot);
    }

    updateSincroObserveOnlySummary(summary: SincroMotionObserveOnlySummary): void {
        this.sincroMotionControls.updateSincroObserveOnlySummary(summary);
    }

    updateSincroComposerDryRunSummary(summary: SincroMotionComposerDryRunSummary): void {
        this.sincroMotionControls.updateSincroComposerDryRunSummary(summary);
    }

    updateSincroComposerDryRunResult(result: SincroVrmPoseComposerDryRunResult): void {
        this.sincroMotionControls.updateSincroComposerDryRunResult(result);
    }

    updateSincroPoseRetargetFrame(frame: SincroPoseRetargetFrame): void {
        this.sincroMotionControls.updateSincroPoseRetargetFrame(frame);
    }

    updateAvatarMotionProfile(profile: MinimalAvatarMotionProfile | undefined): void {
        this.sincroMotionControls.updateAvatarMotionProfile(profile);
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.sincroMotionControls.setSincroPoseRetargetConfig(config);
    }

    setSincroPoseRetargetConfigChangeCallback(
        callback: (config: Partial<SincroPoseRetargetConfig>) => void,
    ): void {
        this.sincroMotionControls.setSincroPoseRetargetConfigChangeCallback(callback);
    }

    applySincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.sincroMotionControls.applySincroPoseRetargetConfig(config);
    }

    setCharacterGazePaused(paused: boolean): void {
        this.gazeControls.setCharacterGazePaused(paused);
    }

    setCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        this.gazeControls.setCharacterGazeTrackingTuning(config);
    }

    setCharacterGazeTrackingTuningChangeCallback(
        callback: (config: CharacterGazeTrackingTuningUiConfig) => void,
    ): void {
        this.gazeControls.setCharacterGazeTrackingTuningChangeCallback(callback);
    }

    applyCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        this.gazeControls.applyCharacterGazeTrackingTuning(config);
    }

    private updateSnapshot(
        updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot,
    ): void {
        this.snapshot = updater(this.snapshot);
        this.eventHub.emitSnapshotChanged();
    }

    private emitEvent(event: DebugConsoleManagerEvent): void {
        this.eventHub.emitEvent(event);
    }
}
