export type AudioFilterControlConfig = {
    highpassHz: number;
    lowpassEnabled: boolean;
    lowpassHz: number;
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
