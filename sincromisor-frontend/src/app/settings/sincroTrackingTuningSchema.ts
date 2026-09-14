import { z } from "zod";
import { CHARACTER_GAZE_TRACKING_TUNING_PRESETS } from "../../features/debug/model/debugConsolePublicTypes";

// 保存境界では有限値と実在する入力範囲を検証する。プリセットやラジアン値を表示刻みへ丸めない。
const gaze = CHARACTER_GAZE_TRACKING_TUNING_PRESETS.balanced;
export const sincroGazeTuningSchema = z.object({
    minimumHoldMs: z.number().min(0).max(2000).catch(gaze.minimumHoldMs),
    switchMargin: z.number().min(0).max(0.5).catch(gaze.switchMargin),
    relinkDistance: z.number().min(0.05).max(0.5).catch(gaze.relinkDistance),
    oneEuroMinCutoff: z.number().min(0.1).max(4).catch(gaze.oneEuroMinCutoff),
    oneEuroBeta: z.number().min(0).max(0.2).catch(gaze.oneEuroBeta),
    oneEuroDCutoff: z.number().positive().catch(gaze.oneEuroDCutoff),
    deadband: z.number().min(0).max(0.02).catch(gaze.deadband),
});

/** 未指定の姿勢強度を生成せず、通常設定からの初期値を維持する部分設定。 */
export const sincroPoseTuningSchema = z.object({
    intensityScale: z.number().min(0).max(1.2).optional().catch(undefined),
    minConfidence: z.number().min(0).max(1).optional().catch(undefined),
    smoothingMs: z.number().min(40).max(800).optional().catch(undefined),
    returnToNeutralMs: z.number().min(80).max(2000).optional().catch(undefined),
    armIkStrength: z.number().min(0).max(1).optional().catch(undefined),
    armIkTargetScale: z.number().min(0.2).max(1.5).optional().catch(undefined),
    armIkMaxLiftRad: z
        .number()
        .min(0)
        .max(Math.PI / 2)
        .optional()
        .catch(undefined),
    armIkMaxOpenRad: z
        .number()
        .min(0)
        .max(Math.PI / 2)
        .optional()
        .catch(undefined),
    armIkMaxForearmFlexRad: z
        .number()
        .min(0)
        .max(Math.PI / 2)
        .optional()
        .catch(undefined),
    armIkMode: z
        .enum(["world_3d_ik", "screen_space_ik", "feature_only"])
        .optional()
        .catch(undefined),
    composerSemanticFingerApplicationMode: z.enum(["composer", "off"]).optional().catch(undefined),
});
