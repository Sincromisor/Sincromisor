import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../FaceTracking/SincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseLowerBodyTargetSnapshot,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../FaceTracking/SincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../FaceTracking/SincroTrackerWorkerTypes";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
    type SincroPoseRetargetFrame,
} from "../SincroVRM/VRMCharacter/SincroPoseRetargeter";
import type { SincroArmIkConstraintSnapshot } from "../SincroVRM/VRMCharacter/sincroArmIkConstraint";

type AudioMeterHandle = {
    audioContext: AudioContext;
    sourceNode: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    data: Uint8Array;
    frameId: number;
    lowInputFrames: number;
    clippingHoldFrames: number;
    displayLevel: number;
    lastMeterUpdateAt: number;
};

export type AudioFilterControlConfig = {
    highpassHz: number;
    lowpassEnabled: boolean;
    lowpassHz: number;
};

type RuntimeAudioConstraintKey = "autoGainControl" | "noiseSuppression" | "echoCancellation";

type RuntimeAudioConstraintApplyStatus = {
    key: RuntimeAudioConstraintKey;
    enabled: boolean;
    status: "pending" | "applied" | "failed";
    message?: string;
};

export type VadThresholdMode = "manual" | "auto" | "learned";

export type LearnedVadUiReport = {
    status: "idle" | "loading" | "ready" | "running" | "fallback" | "unavailable";
    probability: number | null;
    txFrames?: number;
    rxPredictions?: number;
    message?: string;
};

export type LearnedVadTuningUiConfig = {
    onThreshold: number;
    offThreshold: number;
    hangoverMs: number;
    minInferIntervalMs: number;
    onConsecutiveFrames: number;
    offConsecutiveFrames: number;
};

export type LearnedVadPerformanceMode = "low_cpu" | "balanced" | "high_accuracy";

export type DebugConsoleManagerEvent =
    | { type: "local_vad_state"; isSpeech: boolean }
    | { type: "learned_vad_state"; report: LearnedVadUiReport }
    | { type: "face_x"; value: number }
    | { type: "face_y"; value: number }
    | { type: "facing"; value: number }
    | { type: "character_eye_status"; watching: boolean }
    | { type: "gaze_target_debug"; message: string }
    | { type: "rtc_event_log"; message: string }
    | { type: "ice_connection_state"; value: string }
    | { type: "signaling_state"; value: string };

export type CharacterGazeTrackingTuningUiConfig = {
    minimumHoldMs: number;
    switchMargin: number;
    relinkDistance: number;
    oneEuroMinCutoff: number;
    oneEuroBeta: number;
    oneEuroDCutoff: number;
    deadband: number;
};

export type CharacterGazeTrackingTuningPresetKey = "stable" | "balanced" | "responsive";

export const CHARACTER_GAZE_TRACKING_TUNING_PRESETS: Record<
    CharacterGazeTrackingTuningPresetKey,
    CharacterGazeTrackingTuningUiConfig
> = {
    stable: {
        minimumHoldMs: 1400,
        switchMargin: 0.22,
        relinkDistance: 0.18,
        oneEuroMinCutoff: 0.8,
        oneEuroBeta: 0.012,
        oneEuroDCutoff: 1.0,
        deadband: 0.0035,
    },
    balanced: {
        minimumHoldMs: 900,
        switchMargin: 0.15,
        relinkDistance: 0.2,
        oneEuroMinCutoff: 1.0,
        oneEuroBeta: 0.02,
        oneEuroDCutoff: 1.0,
        deadband: 0.0025,
    },
    responsive: {
        minimumHoldMs: 450,
        switchMargin: 0.08,
        relinkDistance: 0.24,
        oneEuroMinCutoff: 1.4,
        oneEuroBeta: 0.04,
        oneEuroDCutoff: 1.0,
        deadband: 0.0015,
    },
};

export type DebugConsoleMetricKey =
    | "rtcRoundTripTime"
    | "rtcAvailableOutgoingBitrate"
    | "rtcCandidatePair"
    | "rtcTransportProtocol"
    | "rtcLocalCandidate"
    | "rtcRemoteCandidate"
    | "outboundAudioBitrate"
    | "inboundAudioBitrate"
    | "outboundPacketsSent"
    | "inboundPacketsLost"
    | "inboundPacketLossRate"
    | "inboundJitter";

export type DebugConsoleTrendKey =
    | "trendOutboundAudioBitrate"
    | "trendInboundAudioBitrate"
    | "trendRoundTripTime"
    | "trendInboundPacketLossRate";

export const DEBUG_CONSOLE_TREND_MAX_VALUES: Record<DebugConsoleTrendKey, number> = {
    trendOutboundAudioBitrate: 256000,
    trendInboundAudioBitrate: 256000,
    trendRoundTripTime: 200,
    trendInboundPacketLossRate: 5,
};

type ConstraintStatusSnapshot = {
    text: string;
    title: string;
    tone: "" | "state-ok" | "state-warn" | "state-error";
};

type AudioPanelSnapshot = {
    localLevel: number;
    remoteLevel: number;
    localRms: number;
    localPeak: number;
    localVadIsSpeech: boolean;
    localWarningState: "ok" | "silent" | "error";
    localWarningText: string;
    vadThresholdMode: VadThresholdMode;
    vadRmsThreshold: number;
    filterConfig: AudioFilterControlConfig;
    learnedVadPerformanceMode: LearnedVadPerformanceMode;
    learnedVadStrictMode: boolean;
    learnedVadTuning: LearnedVadTuningUiConfig;
    learnedVadReport: LearnedVadUiReport;
    constraintStatus: ConstraintStatusSnapshot;
};

type GazeSnapshot = {
    faceX: string;
    faceY: string;
    facing: string;
    status: string;
    targetDebug: string;
    paused: boolean;
    tuning: CharacterGazeTrackingTuningUiConfig;
};

type SincroMotionSnapshot = {
    face: SincroFaceMotionSnapshot;
    pose: SincroPoseMotionSnapshot;
    tracker: SincroTrackerWorkerStats;
    poseRetarget: Pick<
        SincroPoseRetargetConfig,
        | "intensityScale"
        | "minConfidence"
        | "returnToNeutralMs"
        | "smoothingMs"
        | "armIkStrength"
        | "armIkTargetScale"
        | "armIkMaxLiftRad"
        | "armIkMaxOpenRad"
        | "armIkMaxForearmFlexRad"
        | "armIkMode"
    >;
    poseRetargetRuntime: Pick<
        SincroPoseRetargetFrame,
        | "active"
        | "confidence"
        | "ikMode"
        | "fallbackReason"
        | "solverProbe"
        | "anchor"
        | "leftArm"
        | "rightArm"
    >;
};

type RtcSnapshot = {
    iceConnectionState: string;
    iceGatheringState: string;
    signalingState: string;
    metrics: Record<DebugConsoleMetricKey, string>;
    trends: Record<DebugConsoleTrendKey, number[]>;
    textChannelLog: string;
    telopChannelLog: string;
    rtcEventLog: string;
    offerSdp: string;
    answerSdp: string;
};

export type DebugConsoleSnapshot = {
    audio: AudioPanelSnapshot;
    gaze: GazeSnapshot;
    sincroMotion: SincroMotionSnapshot;
    rtc: RtcSnapshot;
};

const DEFAULT_AUDIO_FILTER_CONFIG: AudioFilterControlConfig = {
    highpassHz: 120,
    lowpassEnabled: false,
    lowpassHz: 4200,
};

const DEFAULT_LEARNED_VAD_TUNING: LearnedVadTuningUiConfig = {
    onThreshold: 0.0008,
    offThreshold: 0.0004,
    hangoverMs: 180,
    minInferIntervalMs: 80,
    onConsecutiveFrames: 2,
    offConsecutiveFrames: 2,
};

const DEFAULT_GAZE_TUNING: CharacterGazeTrackingTuningUiConfig = {
    ...CHARACTER_GAZE_TRACKING_TUNING_PRESETS.balanced,
};

const DEFAULT_RTC_METRICS: Record<DebugConsoleMetricKey, string> = {
    rtcRoundTripTime: "-",
    rtcAvailableOutgoingBitrate: "-",
    rtcCandidatePair: "-",
    rtcTransportProtocol: "-",
    rtcLocalCandidate: "-",
    rtcRemoteCandidate: "-",
    outboundAudioBitrate: "-",
    inboundAudioBitrate: "-",
    outboundPacketsSent: "-",
    inboundPacketsLost: "-",
    inboundPacketLossRate: "-",
    inboundJitter: "-",
};

function createDefaultFaceMotionSnapshot(): SincroFaceMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
        blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
    };
}

function createDefaultPoseMotionSnapshot(): SincroPoseMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        upperBody: { ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody },
        leftArm: clonePoseArmMotion(DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT),
        rightArm: clonePoseArmMotion(DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT),
        lowerBodyTargets: cloneLowerBodyTargets(DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT),
    };
}

function createNeutralArmIkConstraint(): SincroArmIkConstraintSnapshot {
    return {
        reasons: [],
        jointLimited: false,
        poleStabilized: false,
        collisionAvoided: false,
        weightScale: 1,
        targetPushDistance: 0,
    };
}

function createDefaultSnapshot(): DebugConsoleSnapshot {
    return {
        audio: {
            localLevel: 0,
            remoteLevel: 0,
            localRms: 0,
            localPeak: 0,
            localVadIsSpeech: false,
            localWarningState: "ok",
            localWarningText: "Normal",
            vadThresholdMode: "manual",
            vadRmsThreshold: 0.015,
            filterConfig: { ...DEFAULT_AUDIO_FILTER_CONFIG },
            learnedVadPerformanceMode: "balanced",
            learnedVadStrictMode: false,
            learnedVadTuning: { ...DEFAULT_LEARNED_VAD_TUNING },
            learnedVadReport: {
                status: "idle",
                probability: null,
            },
            constraintStatus: {
                text: "NS/EC/AGC: 未確認",
                title: "",
                tone: "",
            },
        },
        gaze: {
            faceX: "",
            faceY: "",
            facing: "",
            status: "みてない",
            targetDebug: "-",
            paused: false,
            tuning: { ...DEFAULT_GAZE_TUNING },
        },
        sincroMotion: {
            face: createDefaultFaceMotionSnapshot(),
            pose: createDefaultPoseMotionSnapshot(),
            tracker: {
                mode: "main-thread",
                status: "idle",
                transferTimeMs: 0,
                workerRoundTripMs: 0,
                loadTimeMs: 0,
                droppedFrames: 0,
                fallbackReason: null,
            },
            poseRetarget: {
                intensityScale: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.intensityScale,
                minConfidence: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.minConfidence,
                returnToNeutralMs: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.returnToNeutralMs,
                smoothingMs: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.smoothingMs,
                armIkStrength: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkStrength,
                armIkTargetScale: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkTargetScale,
                armIkMaxLiftRad: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMaxLiftRad,
                armIkMaxOpenRad: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMaxOpenRad,
                armIkMaxForearmFlexRad: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMaxForearmFlexRad,
                armIkMode: DEFAULT_SINCRO_POSE_RETARGET_CONFIG.armIkMode,
            },
            poseRetargetRuntime: {
                active: false,
                confidence: 0,
                ikMode: "fallback",
                fallbackReason: "neutral",
                solverProbe: {
                    ccdik: null,
                },
                anchor: {
                    active: false,
                    weight: 0,
                    reason: "neutral",
                    shoulderOffset: { x: 0, y: 0 },
                },
                leftArm: {
                    active: false,
                    ikActive: false,
                    ikWeight: 0,
                    fallbackReason: "neutral",
                    ikSolverMode: "none",
                    constraint: createNeutralArmIkConstraint(),
                    upperArm: { x: 0, y: 0, z: 0 },
                    lowerArm: { x: 0, y: 0, z: 0 },
                    wrist: { x: 0, y: 0, z: 0 },
                    upperArmQuaternion: null,
                    lowerArmQuaternion: null,
                },
                rightArm: {
                    active: false,
                    ikActive: false,
                    ikWeight: 0,
                    fallbackReason: "neutral",
                    ikSolverMode: "none",
                    constraint: createNeutralArmIkConstraint(),
                    upperArm: { x: 0, y: 0, z: 0 },
                    lowerArm: { x: 0, y: 0, z: 0 },
                    wrist: { x: 0, y: 0, z: 0 },
                    upperArmQuaternion: null,
                    lowerArmQuaternion: null,
                },
            },
        },
        rtc: {
            iceConnectionState: "",
            iceGatheringState: "",
            signalingState: "",
            metrics: { ...DEFAULT_RTC_METRICS },
            trends: {
                trendOutboundAudioBitrate: [],
                trendInboundAudioBitrate: [],
                trendRoundTripTime: [],
                trendInboundPacketLossRate: [],
            },
            textChannelLog: "",
            telopChannelLog: "",
            rtcEventLog: "",
            offerSdp: "",
            answerSdp: "",
        },
    };
}

// DOM 主導だった旧 Debug Console を、React view が購読する診断 snapshot 供給元へ縮退する。
// 既存 public API は維持し、RTC / Audio / Gaze 側からの呼び出し先は変えずに移行を進める。
export class DebugConsoleManager {
    private static instance: DebugConsoleManager;
    private static readonly EVENT_LOG_LINES = 80;
    private static readonly CHANNEL_LOG_LINES = 30;
    private static readonly TREND_POINTS = 60;
    private static readonly AUDIO_CLIP_THRESHOLD = 0.98;
    private static readonly AUDIO_LOW_INPUT_THRESHOLD = 0.015;
    private static readonly AUDIO_LOW_INPUT_HOLD_FRAMES = 120;
    private static readonly AUDIO_CLIP_HOLD_FRAMES = 30;
    private static readonly AUDIO_WARNING_SWITCH_HOLD_FRAMES = 18;
    private static readonly AUDIO_METER_UPDATE_INTERVAL_MS = 80;

    private snapshot: DebugConsoleSnapshot = createDefaultSnapshot();
    private readonly listeners = new Set<(event: DebugConsoleManagerEvent) => void>();
    private readonly snapshotListeners = new Set<() => void>();
    private readonly localAudioConstraintApplyState: Partial<
        Record<RuntimeAudioConstraintKey, RuntimeAudioConstraintApplyStatus>
    > = {};
    private localAudioMeterHandle: AudioMeterHandle | null = null;
    private remoteAudioMeterHandle: AudioMeterHandle | null = null;
    private localAudioWarningState: "ok" | "silent" | "error" = "ok";
    private localAudioWarningPendingState: "ok" | "silent" | "error" = "ok";
    private localAudioWarningPendingFrames = 0;
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
        const tone: ConstraintStatusSnapshot["tone"] = hasFailed
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

    private applyLocalWarningState(nextState: "ok" | "silent" | "error"): void {
        if (nextState === this.localAudioWarningState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 0;
            return;
        }
        if (nextState !== this.localAudioWarningPendingState) {
            this.localAudioWarningPendingState = nextState;
            this.localAudioWarningPendingFrames = 1;
            return;
        }
        this.localAudioWarningPendingFrames += 1;
        if (
            this.localAudioWarningPendingFrames <
            DebugConsoleManager.AUDIO_WARNING_SWITCH_HOLD_FRAMES
        ) {
            return;
        }
        this.localAudioWarningState = nextState;
        this.localAudioWarningPendingFrames = 0;
        const text =
            nextState === "error" ? "Clipping" : nextState === "silent" ? "Silence" : "Normal";
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                localWarningState: nextState,
                localWarningText: text,
            },
        }));
    }

    private stopAudioMeter(handle: AudioMeterHandle | null, target: "local" | "remote"): void {
        if (!handle) {
            return;
        }
        cancelAnimationFrame(handle.frameId);
        handle.sourceNode.disconnect();
        handle.analyser.disconnect();
        handle.audioContext.close().catch((error) => console.error(error));
        if (target === "local") {
            this.localAudioMeterHandle = null;
            this.localAudioWarningState = "ok";
            this.localAudioWarningPendingState = "ok";
            this.localAudioWarningPendingFrames = 0;
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
            return;
        }
        this.remoteAudioMeterHandle = null;
        this.updateSnapshot((snapshot) => ({
            ...snapshot,
            audio: {
                ...snapshot.audio,
                remoteLevel: 0,
            },
        }));
    }

    private startAudioMeter(
        track: MediaStreamTrack,
        target: "local" | "remote",
    ): AudioMeterHandle | null {
        if (track.kind !== "audio") {
            return null;
        }
        const audioContext = new AudioContext();
        const mediaStream = new MediaStream([track]);
        const sourceNode = audioContext.createMediaStreamSource(mediaStream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = 0.65;
        sourceNode.connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const handle: AudioMeterHandle = {
            audioContext,
            sourceNode,
            analyser,
            data,
            frameId: 0,
            lowInputFrames: 0,
            clippingHoldFrames: 0,
            displayLevel: 0,
            lastMeterUpdateAt: 0,
        };
        const loop = (): void => {
            analyser.getByteTimeDomainData(data);
            let squareSum = 0;
            let peak = 0;
            for (let index = 0; index < data.length; index += 1) {
                const normalized = (data[index] - 128) / 128;
                squareSum += normalized * normalized;
                peak = Math.max(peak, Math.abs(normalized));
            }
            const rms = Math.sqrt(squareSum / data.length);
            handle.displayLevel = Math.max(handle.displayLevel * 0.82, peak);
            const now = performance.now();
            if (
                now - handle.lastMeterUpdateAt >=
                DebugConsoleManager.AUDIO_METER_UPDATE_INTERVAL_MS
            ) {
                handle.lastMeterUpdateAt = now;
                if (target === "local") {
                    if (peak >= DebugConsoleManager.AUDIO_CLIP_THRESHOLD) {
                        handle.clippingHoldFrames = DebugConsoleManager.AUDIO_CLIP_HOLD_FRAMES;
                    } else {
                        handle.clippingHoldFrames = Math.max(0, handle.clippingHoldFrames - 1);
                    }
                    if (rms <= DebugConsoleManager.AUDIO_LOW_INPUT_THRESHOLD) {
                        handle.lowInputFrames += 1;
                    } else {
                        handle.lowInputFrames = 0;
                    }
                    const nextWarningState: "ok" | "silent" | "error" =
                        handle.clippingHoldFrames > 0
                            ? "error"
                            : handle.lowInputFrames >=
                                DebugConsoleManager.AUDIO_LOW_INPUT_HOLD_FRAMES
                              ? "silent"
                              : "ok";
                    this.applyLocalWarningState(nextWarningState);
                    this.updateSnapshot((snapshot) => ({
                        ...snapshot,
                        audio: {
                            ...snapshot.audio,
                            localLevel: handle.displayLevel,
                            localRms: rms,
                            localPeak: peak,
                        },
                    }));
                } else {
                    this.updateSnapshot((snapshot) => ({
                        ...snapshot,
                        audio: {
                            ...snapshot.audio,
                            remoteLevel: handle.displayLevel,
                        },
                    }));
                }
            }
            handle.frameId = requestAnimationFrame(loop);
        };
        handle.frameId = requestAnimationFrame(loop);
        return handle;
    }

    setLocalAudioTrack(track: MediaStreamTrack): void {
        this.stopAudioMeter(this.localAudioMeterHandle, "local");
        this.localAudioMeterHandle = this.startAudioMeter(track, "local");
    }

    setRemoteAudioTrack(track: MediaStreamTrack): void {
        this.stopAudioMeter(this.remoteAudioMeterHandle, "remote");
        this.remoteAudioMeterHandle = this.startAudioMeter(track, "remote");
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
                face: {
                    ...snapshot,
                    headPose: { ...snapshot.headPose },
                    blendshapes: { ...snapshot.blendshapes },
                },
            },
        }));
    }

    updateSincroPoseMotion(snapshot: SincroPoseMotionSnapshot): void {
        this.updateSnapshot((currentSnapshot) => ({
            ...currentSnapshot,
            sincroMotion: {
                ...currentSnapshot.sincroMotion,
                pose: {
                    ...snapshot,
                    upperBody: { ...snapshot.upperBody },
                    leftArm: clonePoseArmMotion(snapshot.leftArm),
                    rightArm: clonePoseArmMotion(snapshot.rightArm),
                    lowerBodyTargets: cloneLowerBodyTargets(snapshot.lowerBodyTargets),
                },
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

function clonePoseArmMotion(snapshot: SincroPoseArmMotionSnapshot): SincroPoseArmMotionSnapshot {
    return {
        ...snapshot,
        targets: {
            shoulder: cloneTargetPoint(snapshot.targets.shoulder),
            elbow: cloneTargetPoint(snapshot.targets.elbow),
            wrist: cloneTargetPoint(snapshot.targets.wrist),
        },
    };
}

function cloneLowerBodyTargets(
    snapshot: SincroPoseLowerBodyTargetSnapshot,
): SincroPoseLowerBodyTargetSnapshot {
    return {
        leftHip: cloneTargetPoint(snapshot.leftHip),
        rightHip: cloneTargetPoint(snapshot.rightHip),
        leftKnee: cloneTargetPoint(snapshot.leftKnee),
        rightKnee: cloneTargetPoint(snapshot.rightKnee),
        leftAnkle: cloneTargetPoint(snapshot.leftAnkle),
        rightAnkle: cloneTargetPoint(snapshot.rightAnkle),
    };
}

function cloneTargetPoint(snapshot: SincroPoseTargetPointSnapshot): SincroPoseTargetPointSnapshot {
    return {
        ...snapshot,
        world: { ...snapshot.world },
    };
}

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
