import type { SincroFaceMotionSnapshot } from "../FaceTracking/SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../FaceTracking/SincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../FaceTracking/SincroTrackerWorkerTypes";
import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../SincroVRM/VRMCharacter/SincroPoseRetargeter";
import { DebugConsoleAudioMeter } from "./debugConsoleAudioMeter";
import {
    cloneSincroFaceMotionSnapshot,
    cloneSincroPoseMotionSnapshot,
    createDefaultFaceMotionSnapshot,
    createDefaultPoseMotionSnapshot,
} from "./debugConsoleMotionSnapshot";
import type {
    AudioFilterControlConfig,
    CharacterGazeTrackingTuningUiConfig,
    DebugConsoleManagerEvent,
    DebugConsoleMetricKey,
    DebugConsoleTrendKey,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
    LearnedVadUiReport,
    VadThresholdMode,
} from "./debugConsolePublicTypes";
import { DEBUG_CONSOLE_TREND_MAX_VALUES } from "./debugConsolePublicTypes";
import {
    createDefaultSnapshot,
    DEFAULT_RTC_METRICS,
    type DebugConsoleSnapshot,
} from "./debugConsoleSnapshot";

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

type RuntimeAudioConstraintKey = "autoGainControl" | "noiseSuppression" | "echoCancellation";

type RuntimeAudioConstraintApplyStatus = {
    key: RuntimeAudioConstraintKey;
    enabled: boolean;
    status: "pending" | "applied" | "failed";
    message?: string;
};

type ConstraintStatusTone = "" | "state-ok" | "state-warn" | "state-error";

// DOM 主導だった旧 Debug Console を、React view が購読する診断 snapshot 供給元へ縮退する。
// 既存 public API は維持し、RTC / Audio / Gaze 側からの呼び出し先は変えずに移行を進める。
export class DebugConsoleManager {
    private static instance: DebugConsoleManager;
    private static readonly EVENT_LOG_LINES = 80;
    private static readonly CHANNEL_LOG_LINES = 30;
    private static readonly TREND_POINTS = 60;

    private snapshot: DebugConsoleSnapshot = createDefaultSnapshot();
    private readonly listeners = new Set<(event: DebugConsoleManagerEvent) => void>();
    private readonly snapshotListeners = new Set<() => void>();
    private readonly localAudioConstraintApplyState: Partial<
        Record<RuntimeAudioConstraintKey, RuntimeAudioConstraintApplyStatus>
    > = {};
    private readonly audioMeter = new DebugConsoleAudioMeter({
        onLocalReset: () => {
            this.updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    localLevel: 0,
                    localRms: 0,
                    localPeak: 0,
                    localWarningState: "ok",
                    localWarningText: "Normal",
                },
            }));
            this.updateLocalVadState(false);
        },
        onRemoteReset: () => {
            this.updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    remoteLevel: 0,
                },
            }));
        },
        onLocalStats: ({ level, rms, peak }) => {
            this.updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    localLevel: level,
                    localRms: rms,
                    localPeak: peak,
                },
            }));
        },
        onRemoteLevel: (level) => {
            this.updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    remoteLevel: level,
                },
            }));
        },
        onLocalWarning: ({ state, text }) => {
            this.updateSnapshot((snapshot) => ({
                ...snapshot,
                audio: {
                    ...snapshot.audio,
                    localWarningState: state,
                    localWarningText: text,
                },
            }));
        },
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
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    subscribeSnapshot(listener: () => void): () => void {
        this.snapshotListeners.add(listener);
        return () => {
            this.snapshotListeners.delete(listener);
        };
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
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                vadThresholdMode: mode,
            },
        }));
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
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                learnedVadTuning: {
                    ...config,
                    onConsecutiveFrames: Math.max(1, Math.round(config.onConsecutiveFrames)),
                    offConsecutiveFrames: Math.max(1, Math.round(config.offConsecutiveFrames)),
                },
            },
        }));
    }

    applyLocalLearnedVadTuning(config: LearnedVadTuningUiConfig): void {
        this.setLocalLearnedVadTuning(config);
        this.onLocalLearnedVadTuningChange(config);
    }

    setLocalLearnedVadPerformanceMode(mode: LearnedVadPerformanceMode): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                learnedVadPerformanceMode: mode,
            },
        }));
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
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                learnedVadStrictMode: enabled,
            },
        }));
    }

    setLocalLearnedVadStrictModeChangeCallback(callback: (enabled: boolean) => void): void {
        this.onLocalLearnedVadStrictModeChange = callback;
    }

    applyLocalLearnedVadStrictMode(enabled: boolean): void {
        this.setLocalLearnedVadStrictMode(enabled);
        this.onLocalLearnedVadStrictModeChange(enabled);
    }

    setLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                filterConfig: {
                    highpassHz: Math.max(60, Math.min(300, Math.round(config.highpassHz))),
                    lowpassEnabled: !!config.lowpassEnabled,
                    lowpassHz: Math.max(2500, Math.min(10000, Math.round(config.lowpassHz))),
                },
            },
        }));
    }

    setLocalAudioFilterChangeCallback(callback: (config: AudioFilterControlConfig) => void): void {
        this.onLocalAudioFilterChange = callback;
    }

    applyLocalAudioFilterConfig(config: AudioFilterControlConfig): void {
        this.setLocalAudioFilterConfig(config);
        this.onLocalAudioFilterChange(this.snapshot.audio.filterConfig);
    }

    setLocalVadRmsThreshold(value: number): void {
        const clamped = Math.max(0.005, Math.min(0.2, value));
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                vadRmsThreshold: clamped,
            },
        }));
    }

    setLocalVadRmsThresholdChangeCallback(callback: (threshold: number) => void): void {
        this.onLocalVadRmsThresholdChange = callback;
    }

    applyLocalVadRmsThreshold(value: number): void {
        this.setLocalVadRmsThreshold(value);
        this.onLocalVadRmsThresholdChange(this.snapshot.audio.vadRmsThreshold);
    }

    updateLocalVadState(isSpeech: boolean): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                localVadIsSpeech: isSpeech,
            },
        }));
        this.emitEvent({ type: "local_vad_state", isSpeech });
    }

    updateLearnedVadState(report: LearnedVadUiReport): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                learnedVadReport: { ...report },
            },
        }));
        this.emitEvent({ type: "learned_vad_state", report });
    }

    updateLocalAudioConstraintApplyStatus(report: RuntimeAudioConstraintApplyStatus): void {
        this.localAudioConstraintApplyState[report.key] = report;
        this.renderLocalAudioConstraintApplyStatus();
    }

    private renderLocalAudioConstraintApplyStatus(): void {
        const order: RuntimeAudioConstraintKey[] = [
            "noiseSuppression",
            "echoCancellation",
            "autoGainControl",
        ];
        const labels: Record<RuntimeAudioConstraintKey, string> = {
            noiseSuppression: "NS",
            echoCancellation: "EC",
            autoGainControl: "AGC",
        };
        const text = order
            .map((key) => {
                const state = this.localAudioConstraintApplyState[key];
                if (!state) {
                    return `${labels[key]}:未確認`;
                }
                if (state.status === "pending") {
                    return `${labels[key]}:${state.enabled ? "ON" : "OFF"}(次回開始時)`;
                }
                if (state.status === "applied") {
                    return `${labels[key]}:${state.enabled ? "ON" : "OFF"}(反映)`;
                }
                return `${labels[key]}:${state.enabled ? "ON" : "OFF"}(未反映)`;
            })
            .join(" / ");
        const title = order
            .map((key) => {
                const state = this.localAudioConstraintApplyState[key];
                if (!state?.message) {
                    return "";
                }
                return `${labels[key]}: ${state.message}`;
            })
            .filter((line) => line.length > 0)
            .join("\n");
        const hasFailed = order.some(
            (key) => this.localAudioConstraintApplyState[key]?.status === "failed",
        );
        const hasPending = order.some(
            (key) => this.localAudioConstraintApplyState[key]?.status === "pending",
        );
        const tone: ConstraintStatusTone = hasFailed
            ? "state-error"
            : hasPending
              ? "state-warn"
              : "state-ok";
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                constraintStatus: {
                    text,
                    title,
                    tone,
                },
            },
        }));
    }

    setLocalAudioTrack(track: MediaStreamTrack): void {
        this.audioMeter.setLocalAudioTrack(track);
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        this.audioMeter.setRemoteAudioTrack(track);
    }

    resetRealtimeStats(): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                metrics: { ...DEFAULT_RTC_METRICS },
                trends: {
                    trendOutboundAudioBitrate: [],
                    trendInboundAudioBitrate: [],
                    trendRoundTripTime: [],
                    trendInboundPacketLossRate: [],
                },
            },
        }));
    }

    updateMetricValue(key: string, value: string): void {
        if (!(key in DEFAULT_RTC_METRICS)) {
            return;
        }
        const metricKey = key as DebugConsoleMetricKey;
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                metrics: {
                    ...snapshot.rtc.metrics,
                    [metricKey]: value,
                },
            },
        }));
    }

    pushTrendPoint(trendKey: string, value: number | null): void {
        if (!(trendKey in DEBUG_CONSOLE_TREND_MAX_VALUES)) {
            return;
        }
        const key = trendKey as DebugConsoleTrendKey;
        this.updateSnapshot((snapshot) => {
            const nextSeries = [...snapshot.rtc.trends[key]];
            if (value != null && Number.isFinite(value)) {
                nextSeries.push(value);
            } else {
                nextSeries.push(0);
            }
            if (nextSeries.length > DebugConsoleManager.TREND_POINTS) {
                nextSeries.splice(0, nextSeries.length - DebugConsoleManager.TREND_POINTS);
            }
            return {
                ...snapshot,
                rtc: {
                    ...snapshot.rtc,
                    trends: {
                        ...snapshot.rtc.trends,
                        [key]: nextSeries,
                    },
                },
            };
        });
    }

    addRtcEventLog(msg: string): void {
        const timestamp = new Date().toLocaleTimeString("ja-JP", {
            hour12: false,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        });
        const logLine = `[${timestamp}] ${msg}\n`;
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                rtcEventLog: this.appendLog(
                    snapshot.rtc.rtcEventLog,
                    logLine,
                    DebugConsoleManager.EVENT_LOG_LINES,
                ),
            },
        }));
        this.emitEvent({ type: "rtc_event_log", message: msg });
    }

    addTelopChannelLog(msg: string): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                telopChannelLog: this.appendLog(
                    snapshot.rtc.telopChannelLog,
                    msg,
                    DebugConsoleManager.CHANNEL_LOG_LINES,
                ),
            },
        }));
    }

    addTextChannelLog(msg: string): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                textChannelLog: this.appendLog(
                    snapshot.rtc.textChannelLog,
                    msg,
                    DebugConsoleManager.CHANNEL_LOG_LINES,
                ),
            },
        }));
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
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                offerSdp: msg,
            },
        }));
    }

    answerSDP(msg: string): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            rtc: {
                ...snapshot.rtc,
                answerSdp: msg,
            },
        }));
    }

    updateFaceXLog(value: number): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                faceX: `${value}`,
            },
        }));
        this.emitEvent({ type: "face_x", value });
    }

    updateFaceYLog(value: number): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                faceY: `${value}`,
            },
        }));
        this.emitEvent({ type: "face_y", value });
    }

    updateFacing(value: number): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                facing: `${value}`,
            },
        }));
        this.emitEvent({ type: "facing", value });
    }

    updateCharacterEyeStatus(watching: boolean): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                status: watching ? "みてる" : "みてない",
            },
        }));
        this.emitEvent({ type: "character_eye_status", watching });
    }

    updateCharacterGazeTargetDebug(message: string): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                targetDebug: message,
            },
        }));
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
                poseRetargetRuntime: {
                    active: frame.active,
                    confidence: frame.confidence,
                    ikMode: frame.ikMode,
                    fallbackReason: frame.fallbackReason,
                    solverProbe: {
                        ccdik: frame.solverProbe.ccdik
                            ? {
                                  ...frame.solverProbe.ccdik,
                                  notes: [...frame.solverProbe.ccdik.notes],
                              }
                            : null,
                    },
                    anchor: {
                        active: frame.anchor.active,
                        weight: frame.anchor.weight,
                        reason: frame.anchor.reason,
                        shoulderOffset: { ...frame.anchor.shoulderOffset },
                    },
                    leftArm: {
                        ...frame.leftArm,
                        constraint: {
                            ...frame.leftArm.constraint,
                            reasons: [...frame.leftArm.constraint.reasons],
                        },
                        upperArm: { ...frame.leftArm.upperArm },
                        lowerArm: { ...frame.leftArm.lowerArm },
                        wrist: { ...frame.leftArm.wrist },
                    },
                    rightArm: {
                        ...frame.rightArm,
                        constraint: {
                            ...frame.rightArm.constraint,
                            reasons: [...frame.rightArm.constraint.reasons],
                        },
                        upperArm: { ...frame.rightArm.upperArm },
                        lowerArm: { ...frame.rightArm.lowerArm },
                        wrist: { ...frame.rightArm.wrist },
                    },
                },
            },
        }));
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            sincroMotion: {
                ...snapshot.sincroMotion,
                poseRetarget: {
                    ...snapshot.sincroMotion.poseRetarget,
                    intensityScale: clampNumber(
                        config.intensityScale ?? snapshot.sincroMotion.poseRetarget.intensityScale,
                        0,
                        1.2,
                    ),
                    minConfidence: clampNumber(
                        config.minConfidence ?? snapshot.sincroMotion.poseRetarget.minConfidence,
                        0,
                        1,
                    ),
                    returnToNeutralMs: clampNumber(
                        config.returnToNeutralMs ??
                            snapshot.sincroMotion.poseRetarget.returnToNeutralMs,
                        80,
                        2000,
                    ),
                    smoothingMs: clampNumber(
                        config.smoothingMs ?? snapshot.sincroMotion.poseRetarget.smoothingMs,
                        40,
                        800,
                    ),
                    armIkStrength: clampNumber(
                        config.armIkStrength ?? snapshot.sincroMotion.poseRetarget.armIkStrength,
                        0,
                        1,
                    ),
                    armIkTargetScale: clampNumber(
                        config.armIkTargetScale ??
                            snapshot.sincroMotion.poseRetarget.armIkTargetScale,
                        0.2,
                        1.5,
                    ),
                    armIkMaxLiftRad: clampNumber(
                        config.armIkMaxLiftRad ??
                            snapshot.sincroMotion.poseRetarget.armIkMaxLiftRad,
                        0,
                        Math.PI / 2,
                    ),
                    armIkMaxOpenRad: clampNumber(
                        config.armIkMaxOpenRad ??
                            snapshot.sincroMotion.poseRetarget.armIkMaxOpenRad,
                        0,
                        Math.PI / 2,
                    ),
                    armIkMaxForearmFlexRad: clampNumber(
                        config.armIkMaxForearmFlexRad ??
                            snapshot.sincroMotion.poseRetarget.armIkMaxForearmFlexRad,
                        0,
                        Math.PI / 2,
                    ),
                    armIkMode: config.armIkMode ?? snapshot.sincroMotion.poseRetarget.armIkMode,
                },
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
        if (paused) {
            this.updateSnapshot((snapshot) => ({
                ...snapshot,
                gaze: {
                    ...snapshot.gaze,
                    paused: true,
                    faceX: "停止中",
                    faceY: "停止中",
                    facing: "停止中",
                    status: "停止中",
                    targetDebug: "停止中",
                },
                sincroMotion: {
                    face: {
                        ...createDefaultFaceMotionSnapshot(),
                        fallbackReason: "tracking_paused",
                        lastUpdatedAtMs: performance.now(),
                    },
                    pose: {
                        ...createDefaultPoseMotionSnapshot(),
                        fallbackReason: "tracking_paused",
                        lastUpdatedAtMs: performance.now(),
                    },
                    tracker: {
                        ...snapshot.sincroMotion.tracker,
                        status: "idle",
                    },
                    poseRetarget: snapshot.sincroMotion.poseRetarget,
                    poseRetargetRuntime: {
                        ...snapshot.sincroMotion.poseRetargetRuntime,
                        active: false,
                        ikMode: "fallback",
                        fallbackReason: "tracking_paused",
                        anchor: {
                            ...snapshot.sincroMotion.poseRetargetRuntime.anchor,
                            active: false,
                            reason: "tracking_paused",
                        },
                    },
                },
            }));
            return;
        }
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                paused: false,
                status: "みてない",
                targetDebug: "-",
            },
        }));
    }

    setCharacterGazeTrackingTuning(config: CharacterGazeTrackingTuningUiConfig): void {
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            gaze: {
                ...snapshot.gaze,
                tuning: {
                    ...config,
                },
            },
        }));
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
        this.updateSnapshot((snapshot) => {
            const previous = snapshot.rtc[key];
            const nextValue = append && previous ? `${previous} -> ${state}` : state;
            return {
                ...snapshot,
                rtc: {
                    ...snapshot.rtc,
                    [key]: nextValue,
                },
            };
        });
    }

    private appendLog(text: string, msg: string, lines: number): string {
        return `${text}${msg}`.split("\n").slice(-lines).join("\n");
    }

    private updateSnapshot(
        updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot,
    ): void {
        this.snapshot = updater(this.snapshot);
        for (const listener of this.snapshotListeners) {
            listener();
        }
    }

    private emitEvent(event: DebugConsoleManagerEvent): void {
        for (const listener of this.listeners) {
            listener(event);
        }
    }
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
