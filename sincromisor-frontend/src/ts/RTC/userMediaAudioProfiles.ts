import type {
    AudioFilterConfig,
    LearnedVadPerformanceMode,
    LearnedVadTuningConfig,
} from "./userMediaTypes";

export const VAD_WORKLET_MODULE_URL = "/worklets/vad-processor.js?v=20260222a";

export const DEFAULT_VAD_RMS_THRESHOLD = 0.015;
export const DEFAULT_VAD_PEAK_THRESHOLD = 0.06;
export const VENUE_VAD_RMS_THRESHOLD = 0.05;
export const VENUE_VAD_PEAK_THRESHOLD = 0.12;

export const AUTO_VAD_MIN_RMS_THRESHOLD = 0.005;
export const AUTO_VAD_MAX_RMS_THRESHOLD = 0.2;
export const AUTO_VAD_NOISE_FLOOR_ALPHA = 0.08;
export const AUTO_VAD_MULTIPLIER = 2.2;
export const AUTO_VAD_OFFSET = 0.003;
export const AUTO_VAD_UPDATE_INTERVAL_MS = 500;

// 学習VADプリセット:
// low_cpu: 推論頻度を抑えて負荷優先
// balanced: 通常運用向け
// high_accuracy: 応答性/取りこぼし低減優先（負荷高め）
export const LEARNED_VAD_TUNING_PRESETS: Record<LearnedVadPerformanceMode, LearnedVadTuningConfig> =
    {
        low_cpu: {
            onThreshold: 0.0012,
            offThreshold: 0.0006,
            hangoverMs: 160,
            minInferIntervalMs: 140,
            onConsecutiveFrames: 2,
            offConsecutiveFrames: 2,
        },
        balanced: {
            onThreshold: 0.0008,
            offThreshold: 0.0004,
            hangoverMs: 180,
            minInferIntervalMs: 80,
            onConsecutiveFrames: 2,
            offConsecutiveFrames: 2,
        },
        high_accuracy: {
            onThreshold: 0.00055,
            offThreshold: 0.00025,
            hangoverMs: 240,
            minInferIntervalMs: 40,
            onConsecutiveFrames: 3,
            offConsecutiveFrames: 2,
        },
    };

export const DEFAULT_FILTER_PROFILE: AudioFilterConfig = {
    highpassHz: 120,
    lowpassEnabled: false,
    lowpassHz: 4200,
    vadThreshold: {
        rmsThreshold: DEFAULT_VAD_RMS_THRESHOLD,
        peakThreshold: DEFAULT_VAD_PEAK_THRESHOLD,
    },
};

export const VENUE_FILTER_PROFILE: AudioFilterConfig = {
    highpassHz: 180,
    lowpassEnabled: true,
    lowpassHz: 4200,
    vadThreshold: {
        rmsThreshold: VENUE_VAD_RMS_THRESHOLD,
        peakThreshold: VENUE_VAD_PEAK_THRESHOLD,
    },
};

export function clampVadThresholds(config: { rmsThreshold: number; peakThreshold: number }): {
    rmsThreshold: number;
    peakThreshold: number;
} {
    return {
        rmsThreshold: Math.max(0.001, Math.min(0.2, config.rmsThreshold)),
        peakThreshold: Math.max(0.01, Math.min(0.99, config.peakThreshold)),
    };
}

export function nextAutoRmsThreshold(noiseFloorRms: number): number {
    return Math.max(
        AUTO_VAD_MIN_RMS_THRESHOLD,
        Math.min(AUTO_VAD_MAX_RMS_THRESHOLD, noiseFloorRms * AUTO_VAD_MULTIPLIER + AUTO_VAD_OFFSET),
    );
}
