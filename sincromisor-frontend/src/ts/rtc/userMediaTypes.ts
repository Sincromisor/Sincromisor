import type { LearnedVadStateReport, LearnedVadTuningConfig } from "./learnedVadWorkerClient";

export type { LearnedVadStateReport, LearnedVadTuningConfig } from "./learnedVadWorkerClient";

export type LearnedVadPerformanceMode = "low_cpu" | "balanced" | "high_accuracy";

export type VadStateReport = {
    isSpeech: boolean;
    rms: number;
    peak: number;
};

export type VadThresholdConfig = {
    rmsThreshold: number;
    peakThreshold: number;
};

export type VadThresholdMode = "manual" | "auto" | "learned";

export type AudioFilterConfig = {
    highpassHz: number;
    lowpassEnabled: boolean;
    lowpassHz: number;
    vadThreshold: VadThresholdConfig;
};

export type AudioConstraintRuntimeApplyReport = {
    key: "autoGainControl" | "noiseSuppression" | "echoCancellation";
    enabled: boolean;
    status: "pending" | "applied" | "failed";
    message?: string;
};

export type LearnedVadStateCallback = (report: LearnedVadStateReport) => void;

export type LearnedVadTuningPatch = Partial<LearnedVadTuningConfig>;
