import type { SincroFaceMotionSnapshot } from "../FaceTracking/SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../FaceTracking/SincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../FaceTracking/SincroTrackerWorkerTypes";
import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../SincroVRM/VRMCharacter/SincroPoseRetargeter";
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
import { DebugConsoleEventHub } from "./debugConsoleEventHub";
import {
    updateGazeEyeStatus,
    updateGazeFaceX,
    updateGazeFaceY,
    updateGazeFacing,
    updateGazePaused,
    updateGazeTargetDebug,
    updateGazeTrackingTuning,
} from "./debugConsoleGazeSnapshot";
import {
    cloneSincroFaceMotionSnapshot,
    cloneSincroPoseMotionSnapshot,
} from "./debugConsoleMotionSnapshot";
import type {
    AudioFilterControlConfig,
    CharacterGazeTrackingTuningUiConfig,
    DebugConsoleManagerEvent,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
    LearnedVadUiReport,
    VadThresholdMode,
} from "./debugConsolePublicTypes";
import {
    appendRtcEventLog,
    appendRtcTelopChannelLog,
    appendRtcTextChannelLog,
    isDebugConsoleMetricKey,
    isDebugConsoleTrendKey,
    pushRtcTrendPoint,
    resetRtcRealtimeStats,
    updateRtcMetric,
    updateRtcSdp,
    updateRtcState,
} from "./debugConsoleRtcSnapshot";
import {
    clonePoseRetargetRuntime,
    updatePoseRetargetConfig,
} from "./debugConsoleSincroMotionRuntime";
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
    private readonly localAudioConstraintApplyState: Partial<
        Record<RuntimeAudioConstraintKey, RuntimeAudioConstraintApplyStatus>
    > = {};
    private readonly audioMeter = createDebugConsoleAudioMeter({
        updateSnapshot: (updater) => this.updateSnapshot(updater),
        updateLocalVadState: (isSpeech) => this.updateLocalVadState(isSpeech),
    });
    private rtcStopHandler: () => void = () => {};
    private onLocalAudioFilterChange: (config: AudioFilterControlConfig) => void = () => {};
    private onLocalLearnedVadTuningChange: (config: LearnedVadTuningUiConfig) => void = () => {};
    private onLocalLearnedVadPerformanceModeChange: (mode: LearnedVadPerformanceMode) => void =
        () => {};
    private onLocalLearnedVadStrictModeChange: (enabled: boolean) => void = () => {};
    private onLocalVadThresholdModeChange: (mode: VadThresholdMode) => void = () => {};
    private onLocalVadRmsThresholdChange: (threshold: number) => void = () => {};
    private onCharacterGazeTrackingTuningChange: (
        config: CharacterGazeTrackingTuningUiConfig,
    ) => void = () => {};
    private onSincroPoseRetargetConfigChange: (config: Partial<SincroPoseRetargetConfig>) => void =
        () => {};

    static getManager(): DebugConsoleManager {
        if (!DebugConsoleManager.instance) {
            DebugConsoleManager.instance = new DebugConsoleManager();
        }
        return DebugConsoleManager.instance;
    }

    private constructor() {
        this.renderLocalAudioConstraintApplyStatus();
    }

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
        this.updateSnapshot((snapshot) => updateAudioVadThresholdMode(snapshot, mode));
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
        this.updateSnapshot((snapshot) => updateAudioLearnedVadTuning(snapshot, config));
    }

    applyLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.setLocalLearnedVadTuning(config);
        this.onLocalLearnedVadTuningChange(config);
    }

    setLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.updateSnapshot((snapshot) => updateAudioLearnedVadPerformanceMode(snapshot, mode));
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
        this.updateSnapshot((snapshot) => updateAudioLearnedVadStrictMode(snapshot, enabled));
    }

    setLocalLearnedVadStrictModeChangeCallback(callback: (enabled: boolean) => void): void {
        this.onLocalLearnedVadStrictModeChange = callback;
    }

    applyLocalLearnedVadStrictMode(enabled: boolean): void {
        this.setLocalLearnedVadStrictMode(enabled);
        this.onLocalLearnedVadStrictModeChange(enabled);
    }

    setLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.updateSnapshot((snapshot) => updateAudioFilterConfig(snapshot, config));
    }

    setLocalAudioFilterChangeCallback(callback: (config: AudioFilterControlConfig) => void): void {
        this.onLocalAudioFilterChange = callback;
    }

    applyLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.setLocalAudioFilterConfig(config);
        this.onLocalAudioFilterChange(this.snapshot.audio.filterConfig);
    }

    setLocalVadRmsThreshold(value: number): void {
        this.updateSnapshot((snapshot) => updateAudioVadRmsThreshold(snapshot, value));
    }

    setLocalVadRmsThresholdChangeCallback(callback: (threshold: number) => void): void {
        this.onLocalVadRmsThresholdChange = callback;
    }

    applyLocalVadRmsThreshold(value: number): void {
        this.setLocalVadRmsThreshold(value);
        this.onLocalVadRmsThresholdChange(this.snapshot.audio.vadRmsThreshold);
    }

    updateLocalVadState(isSpeech: boolean): void {
        this.updateSnapshot((snapshot) => updateAudioVadState(snapshot, isSpeech));
        this.emitEvent({ type: "local_vad_state", isSpeech });
    }

    updateLearnedVadState(report: LearnedVadUiReport): void {
        this.updateSnapshot((snapshot) => updateAudioLearnedVadReport(snapshot, report));
        this.emitEvent({ type: "learned_vad_state", report });
    }

    updateLocalAudioConstraintApplyStatus(report: RuntimeAudioConstraintApplyStatus): void {
        this.localAudioConstraintApplyState[report.key] = report;
        this.renderLocalAudioConstraintApplyStatus();
    }

    private renderLocalAudioConstraintApplyStatus(): void {
        this.updateSnapshot((snapshot) =>
            updateAudioConstraintStatus(snapshot, this.localAudioConstraintApplyState),
        );
    }

    setLocalAudioTrack(track: MediaStreamTrack): void {
        this.audioMeter.setLocalAudioTrack(track);
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        this.audioMeter.setRemoteAudioTrack(track);
    }

    resetRealtimeStats(): void {
        this.updateSnapshot(resetRtcRealtimeStats);
    }

    updateMetricValue(key: string, value: string): void {
        if (!isDebugConsoleMetricKey(key)) {
            return;
        }
        this.updateSnapshot((snapshot) => updateRtcMetric(snapshot, key, value));
    }

    pushTrendPoint(trendKey: string, value: number | null): void {
        if (!isDebugConsoleTrendKey(trendKey)) {
            return;
        }
        this.updateSnapshot((snapshot) => pushRtcTrendPoint(snapshot, trendKey, value));
    }

    addRtcEventLog(msg: string): void {
        this.updateSnapshot((snapshot) => appendRtcEventLog(snapshot, msg));
        this.emitEvent({ type: "rtc_event_log", message: msg });
    }

    addTelopChannelLog(msg: string): void {
        this.updateSnapshot((snapshot) => appendRtcTelopChannelLog(snapshot, msg));
    }

    addTextChannelLog(msg: string): void {
        this.updateSnapshot((snapshot) => appendRtcTextChannelLog(snapshot, msg));
    }

    newIceConnectionState(msg: string): void {
        this.updateIceStateSnapshot("iceConnectionState", msg, true);
        this.addRtcEventLog(`ICE connection state -> ${msg}`);
        this.emitEvent({ type: "ice_connection_state", value: msg });
    }

    updateIceConnectionState(msg: string): void {
        this.updateIceStateSnapshot("iceConnectionState", msg, false);
        this.emitEvent({ type: "ice_connection_state", value: msg });
    }

    newIceGatheringState(msg: string): void {
        this.updateIceStateSnapshot("iceGatheringState", msg, true);
        this.addRtcEventLog(`ICE gathering state -> ${msg}`);
    }

    updateIceGatheringState(msg: string): void {
        this.updateIceStateSnapshot("iceGatheringState", msg, false);
    }

    newSignalingState(msg: string): void {
        this.updateIceStateSnapshot("signalingState", msg, true);
        this.addRtcEventLog(`Signaling state -> ${msg}`);
        this.emitEvent({ type: "signaling_state", value: msg });
    }

    updateSignalingState(msg: string): void {
        this.updateIceStateSnapshot("signalingState", msg, false);
        this.emitEvent({ type: "signaling_state", value: msg });
    }

    offerSDP(msg: string): void {
        this.updateSnapshot((snapshot) => updateRtcSdp(snapshot, "offerSdp", msg));
    }

    answerSDP(msg: string): void {
        this.updateSnapshot((snapshot) => updateRtcSdp(snapshot, "answerSdp", msg));
    }

    updateFaceXLog(value: number): void {
        this.updateSnapshot((snapshot) => updateGazeFaceX(snapshot, value));
        this.emitEvent({ type: "face_x", value });
    }

    updateFaceYLog(value: number): void {
        this.updateSnapshot((snapshot) => updateGazeFaceY(snapshot, value));
        this.emitEvent({ type: "face_y", value });
    }

    updateFacing(value: number): void {
        this.updateSnapshot((snapshot) => updateGazeFacing(snapshot, value));
        this.emitEvent({ type: "facing", value });
    }

    updateCharacterEyeStatus(watching: boolean): void {
        this.updateSnapshot((snapshot) => updateGazeEyeStatus(snapshot, watching));
        this.emitEvent({ type: "character_eye_status", watching });
    }

    updateCharacterGazeTargetDebug(message: string): void {
        this.updateSnapshot((snapshot) => updateGazeTargetDebug(snapshot, message));
        this.emitEvent({ type: "gaze_target_debug", message });
    }

    updateSincroFaceMotion(snapshot: SincroFaceMotionSnapshot): void {
        this.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                face: cloneSincroFaceMotionSnapshot(snapshot),
            },
        }));
    }

    updateSincroPoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        this.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                pose: cloneSincroPoseMotionSnapshot(snapshot),
            },
        }));
    }

    updateSincroTrackerStats(snapshot: SincroTrackerWorkerStats): void {
        this.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                tracker: { ...snapshot },
            },
        }));
    }

    updateSincroPoseRetargetFrame(frame: SincroPoseRetargetFrame): void {
        this.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                poseRetargetRuntime: clonePoseRetargetRuntime(frame),
            },
        }));
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            sincroMotion: {
                ...snapshot.sincroMotion,
                poseRetarget: updatePoseRetargetConfig(snapshot.sincroMotion.poseRetarget, config),
            },
        }));
    }

    setSincroPoseRetargetConfigChangeCallback(
        callback: (config: Partial<SincroPoseRetargetConfig>) => void,
    ): void {
        this.onSincroPoseRetargetConfigChange = callback;
    }

    applySincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.setSincroPoseRetargetConfig(config);
        this.onSincroPoseRetargetConfigChange(this.snapshot.sincroMotion.poseRetarget);
    }

    setCharacterGazePaused(paused: boolean): void {
        this.updateSnapshot((snapshot) => updateGazePaused(snapshot, paused));
    }

    setCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        this.updateSnapshot((snapshot) => updateGazeTrackingTuning(snapshot, config));
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

    private updateIceStateSnapshot(
        key: "iceConnectionState" | "iceGatheringState" | "signalingState",
        state: string,
        append: boolean,
    ): void {
        this.updateSnapshot((snapshot) => updateRtcState(snapshot, key, state, append));
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
