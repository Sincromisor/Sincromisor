import { z } from "zod";
import {
    DEFAULT_FILTER_PROFILE,
    LEARNED_VAD_TUNING_PRESETS,
} from "../../features/media/userMedia/userMediaAudioProfiles";

// 保存入力の境界。表示刻みでは丸めず、欠損・不正なフィールドだけ既存の既定値へ戻す。
const defaults = LEARNED_VAD_TUNING_PRESETS.balanced;
export const sincroAudioTuningSchema = z.object({
    filterConfig: z
        .object({
            highpassHz: z.number().min(60).max(300).catch(DEFAULT_FILTER_PROFILE.highpassHz),
            lowpassEnabled: z.boolean().catch(DEFAULT_FILTER_PROFILE.lowpassEnabled),
            lowpassHz: z.number().min(2500).max(10000).catch(DEFAULT_FILTER_PROFILE.lowpassHz),
        })
        .optional()
        .catch(undefined),
    vadThresholdMode: z.enum(["manual", "auto", "learned"]).optional().catch(undefined),
    vadRmsThreshold: z.number().min(0.005).max(0.2).optional().catch(undefined),
    // 会場プリセットを個別調整で解除しても維持される、専用入力のないピーク閾値。
    peakThreshold: z.number().min(0.01).max(0.99).optional().catch(undefined),
    learnedVadPerformanceMode: z
        .enum(["balanced", "low_cpu", "high_accuracy"])
        .optional()
        .catch(undefined),
    learnedVadStrictMode: z.boolean().optional().catch(undefined),
    learnedVadTuning: z
        .object({
            onThreshold: z.number().min(0.0001).max(0.1).catch(defaults.onThreshold),
            offThreshold: z.number().min(0.00005).max(0.08).catch(defaults.offThreshold),
            hangoverMs: z.number().int().min(0).max(1200).catch(defaults.hangoverMs),
            minInferIntervalMs: z
                .number()
                .int()
                .min(20)
                .max(400)
                .catch(defaults.minInferIntervalMs),
            onConsecutiveFrames: z
                .number()
                .int()
                .min(1)
                .max(10)
                .catch(defaults.onConsecutiveFrames),
            offConsecutiveFrames: z
                .number()
                .int()
                .min(1)
                .max(10)
                .catch(defaults.offConsecutiveFrames),
        })
        .optional()
        .catch(undefined),
});
export type SincroAudioTuning = z.infer<typeof sincroAudioTuningSchema>;
