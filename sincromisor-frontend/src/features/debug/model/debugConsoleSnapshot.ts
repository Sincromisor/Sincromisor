import type { MinimalAvatarMotionProfile } from "../../../character/avatarProfile/minimalAvatarMotionProfile";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
    type SincroPoseRetargetFrame,
} from "../../../character/retargeting/sincroPoseRetargeter";
import type { SincroMotionObserveOnlySummary } from "../../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { SincroFaceMotionSnapshot } from "../../gaze/faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../gaze/trackingRuntime/sincroTrackerWorkerTypes";
import {
    createDefaultFaceMotionSnapshot,
    createDefaultPoseMotionSnapshot,
    createNeutralArmIkConstraint,
} from "./debugConsoleMotionSnapshot";
import {
    type AudioFilterControlConfig,
    CHARACTER_GAZE_TRACKING_TUNING_PRESETS,
    type CharacterGazeTrackingTuningUiConfig,
    type DebugConsoleMetricKey,
    type DebugConsoleTrendKey,
    type LearnedVadPerformanceMode,
    type LearnedVadTuningUiConfig,
    type LearnedVadUiReport,
    type VadThresholdMode,
} from "./debugConsolePublicTypes";

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
    observeOnly: SincroMotionObserveOnlySummary;
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
    > & {
        avatarMotionProfile?: MinimalAvatarMotionProfile;
    };
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

export const DEFAULT_RTC_METRICS: Record<DebugConsoleMetricKey, string> = {
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

export function createDefaultSnapshot(): DebugConsoleSnapshot {
    return {
        audio: createDefaultAudioSnapshot(),
        gaze: createDefaultGazeSnapshot(),
        sincroMotion: createDefaultSincroMotionSnapshot(),
        rtc: createDefaultRtcSnapshot(),
    };
}

function createDefaultAudioSnapshot(): AudioPanelSnapshot {
    return {
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
        },
        constraintStatus: {
            text: "NS/EC/AGC: 未確認",
            title: "",
            tone: "",
        },
    };
}

function createDefaultGazeSnapshot(): GazeSnapshot {
    return {
        faceX: "",
        faceY: "",
        facing: "",
        status: "みてない",
        targetDebug: "-",
        paused: false,
        tuning: { ...DEFAULT_GAZE_TUNING },
    };
}

function createDefaultSincroMotionSnapshot(): SincroMotionSnapshot {
    return {
        face: createDefaultFaceMotionSnapshot(),
        pose: createDefaultPoseMotionSnapshot(),
        tracker: {
            mode: "main-thread",
            status: "idle",
            transferTimeMs: 0,
            workerRoundTripMs: 0,
            loadTimeMs: 0,
            droppedFrames: 0,
        },
        observeOnly: createDefaultObserveOnlySummary(),
        poseRetarget: createDefaultPoseRetargetConfigSnapshot(),
        poseRetargetRuntime: createDefaultPoseRetargetRuntimeSnapshot(),
    };
}

function createDefaultObserveOnlySummary(): SincroMotionObserveOnlySummary {
    return {
        reliability: {
            status: "not_computed",
            reason: "pipeline_not_started",
            warnings: [],
        },
        canonical: {
            status: "not_computed",
            reason: "pipeline_not_started",
            warnings: [],
        },
        temporal: {
            status: "not_computed",
            reason: "pipeline_not_started",
            warnings: [],
        },
        intent: {
            status: "not_computed",
            reason: "pipeline_not_started",
            warnings: [],
        },
        hand: {
            status: "not_computed",
            reason: "pipeline_not_started",
            trackingEnabled: false,
            detected: false,
            left: {
                detected: false,
                source: "lost",
                openness: "unknown",
                confidence: 0,
            },
            right: {
                detected: false,
                source: "lost",
                openness: "unknown",
                confidence: 0,
            },
            warnings: [],
        },
        updatedAtMs: 0,
    };
}

function createDefaultPoseRetargetConfigSnapshot(): SincroMotionSnapshot["poseRetarget"] {
    return {
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
    };
}

function createDefaultPoseRetargetRuntimeSnapshot(): SincroMotionSnapshot["poseRetargetRuntime"] {
    return {
        active: false,
        confidence: 0,
        ikMode: "fallback",
        fallbackReason: "neutral",
        solverProbe: {},
        anchor: {
            active: false,
            weight: 0,
            reason: "neutral",
            shoulderOffset: { x: 0, y: 0 },
        },
        leftArm: createDefaultPoseRetargetArmRuntimeSnapshot(),
        rightArm: createDefaultPoseRetargetArmRuntimeSnapshot(),
        avatarMotionProfile: undefined,
    };
}

function createDefaultPoseRetargetArmRuntimeSnapshot(): SincroMotionSnapshot["poseRetargetRuntime"]["leftArm"] {
    return {
        active: false,
        ikActive: false,
        ikWeight: 0,
        fallbackReason: "neutral",
        ikSolverMode: "none",
        constraint: createNeutralArmIkConstraint(),
        upperArm: { x: 0, y: 0, z: 0 },
        lowerArm: { x: 0, y: 0, z: 0 },
        wrist: { x: 0, y: 0, z: 0 },
        upperArmQuaternion: undefined,
        lowerArmQuaternion: undefined,
    };
}

function createDefaultRtcSnapshot(): RtcSnapshot {
    return {
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
    };
}
