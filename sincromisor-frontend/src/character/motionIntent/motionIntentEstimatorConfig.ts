/**
 * MotionIntentEstimator の tuning 値を正規化する境界。
 *
 * caller 指定 config は UI / motion-debug から来る調整値を含むため、非 finite 値や範囲外値は
 * estimator の side memory を壊さないよう default へ戻すか clamp する。この module は
 * MotionIntentState の保存 schema や candidate 検出順序を変更しない。
 */
import type {
    IntentTimingConfig,
    MotionIntentEstimatorConfig,
    NormalizedEstimatorConfig,
    TimedArmIntent,
} from "./motionIntentEstimatorTypes";

/**
 * MotionIntent の side 正本。
 *
 * 左右は解剖学的 side であり、camera preview の mirror 表示や image-space の左右反転とは分けて扱う。
 */
export const SIDES = ["left", "right"] as const;

const TIMED_INTENTS: readonly TimedArmIntent[] = [
    "pointing",
    "thumbsUp",
    "peace",
    "nearFace",
    "explain",
    "clapLike",
    "guarded",
    "fallback",
];

const DEFAULT_TIMING: Record<TimedArmIntent, IntentTimingConfig> = {
    pointing: { minimumDurationMs: 200, cooldownMs: 500 },
    thumbsUp: { minimumDurationMs: 200, cooldownMs: 500 },
    peace: { minimumDurationMs: 200, cooldownMs: 500 },
    nearFace: { minimumDurationMs: 250, cooldownMs: 300 },
    explain: { minimumDurationMs: 300, cooldownMs: 400 },
    clapLike: { minimumDurationMs: 150, cooldownMs: 800 },
    guarded: { minimumDurationMs: 250, cooldownMs: 500 },
    fallback: { minimumDurationMs: 300, cooldownMs: 0 },
};

/**
 * MotionIntentEstimator の既定 timing / threshold。
 *
 * confidence 系 threshold は Hand / ReliabilityMap の低信頼 frame を semantic intent へ昇格させない
 * gate であり、下げすぎると gesture flicker や semantic fallback frame が増える。near-face /
 * clap / guarded の距離・角度 threshold は body-local scalar と image-space distance の混在値なので、
 * 調整時は `motionIntentEstimator` focused tests と motion-debug replay の `gestureFlickerCount` /
 * `intentInvalidFrameCount` を確認する。値自体は Phase 9 の固定 baseline で、ここでは runtime
 * profile や avatar profile による自動変更を行わない。
 */
export const DEFAULT_CONFIG: NormalizedEstimatorConfig = {
    timing: DEFAULT_TIMING,
    thresholds: {
        gestureConfidence: 0.7,
        handConfidence: 0.6,
        handReliability: 0.6,
        fingerReliability: 0.45,
        fallbackConfidence: 0.15,
        nearFaceElevationRad: 0.2,
        nearFaceForwardness: 0.45,
        clapDistance2d: 0.16,
        guardedHandDistance2d: 0.18,
    },
    wave: {
        minimumDurationMs: 400,
        cooldownMs: 650,
        windowMs: 1200,
        minAlternations: 2,
        minElevationRad: 0.05,
        minBodyLocalVelocityX: 0.05,
        minImageVelocityX: 0.12,
    },
    predictedSemanticHoldMs: 500,
    sideSwapHoldMs: 500,
};

function cloneTiming(
    config: Record<TimedArmIntent, IntentTimingConfig>,
): Record<TimedArmIntent, IntentTimingConfig> {
    return {
        pointing: { ...config.pointing },
        thumbsUp: { ...config.thumbsUp },
        peace: { ...config.peace },
        nearFace: { ...config.nearFace },
        explain: { ...config.explain },
        clapLike: { ...config.clapLike },
        guarded: { ...config.guarded },
        fallback: { ...config.fallback },
    };
}

function clampFinite(
    value: number | undefined,
    defaultValue: number,
    min: number,
    max: number,
): number {
    if (value === undefined || !Number.isFinite(value)) {
        return defaultValue;
    }
    return Math.min(max, Math.max(min, value));
}

function finiteOrDefault(value: number | undefined, defaultValue: number): number {
    return value === undefined || !Number.isFinite(value) ? defaultValue : value;
}

/**
 * optional gesture / reliability 入力を confidence gate に渡す前の `0..1` 正規化に使う。
 *
 * 非 finite 値は tracker / replay 境界の欠損として扱い、例外ではなく `0` に落とす。caller に
 * parse error を返す関数ではないため、保存 schema の検証には使わない。
 */
export function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.min(1, Math.max(0, value));
}

/**
 * 部分指定された estimator config を、全 timed intent と wave detector が読める正規化済み config へ変換する。
 *
 * timing は `0..2000ms` に制限し、semantic hold は prediction window と recovery 表示が破綻しない
 * `200..700ms` に留める。返り値は新しい object で、`DEFAULT_CONFIG` や caller の config を変更しない。
 * invalid 値は throw せず default / clamp に落ちるため、調整 UI は入力失敗をこの関数からは観測しない。
 */
export function normalizeConfig(
    config: MotionIntentEstimatorConfig | undefined,
): NormalizedEstimatorConfig {
    const timing = cloneTiming(DEFAULT_CONFIG.timing);
    for (const intent of TIMED_INTENTS) {
        const override = config?.timing?.[intent];
        timing[intent] = {
            minimumDurationMs: clampFinite(
                override?.minimumDurationMs,
                DEFAULT_CONFIG.timing[intent].minimumDurationMs,
                0,
                2000,
            ),
            cooldownMs: clampFinite(
                override?.cooldownMs,
                DEFAULT_CONFIG.timing[intent].cooldownMs,
                0,
                2000,
            ),
        };
    }

    return {
        timing,
        thresholds: {
            gestureConfidence: clampFinite(
                config?.thresholds?.gestureConfidence,
                DEFAULT_CONFIG.thresholds.gestureConfidence,
                0,
                1,
            ),
            handConfidence: clampFinite(
                config?.thresholds?.handConfidence,
                DEFAULT_CONFIG.thresholds.handConfidence,
                0,
                1,
            ),
            handReliability: clampFinite(
                config?.thresholds?.handReliability,
                DEFAULT_CONFIG.thresholds.handReliability,
                0,
                1,
            ),
            fingerReliability: clampFinite(
                config?.thresholds?.fingerReliability,
                DEFAULT_CONFIG.thresholds.fingerReliability,
                0,
                1,
            ),
            fallbackConfidence: clampFinite(
                config?.thresholds?.fallbackConfidence,
                DEFAULT_CONFIG.thresholds.fallbackConfidence,
                0,
                1,
            ),
            nearFaceElevationRad: clampFinite(
                config?.thresholds?.nearFaceElevationRad,
                DEFAULT_CONFIG.thresholds.nearFaceElevationRad,
                0,
                1,
            ),
            nearFaceForwardness: clampFinite(
                config?.thresholds?.nearFaceForwardness,
                DEFAULT_CONFIG.thresholds.nearFaceForwardness,
                0,
                1,
            ),
            clapDistance2d: clampFinite(
                config?.thresholds?.clapDistance2d,
                DEFAULT_CONFIG.thresholds.clapDistance2d,
                0,
                1,
            ),
            guardedHandDistance2d: clampFinite(
                config?.thresholds?.guardedHandDistance2d,
                DEFAULT_CONFIG.thresholds.guardedHandDistance2d,
                0,
                1,
            ),
        },
        wave: {
            minimumDurationMs: clampFinite(
                config?.wave?.minimumDurationMs,
                DEFAULT_CONFIG.wave.minimumDurationMs,
                0,
                2000,
            ),
            cooldownMs: clampFinite(
                config?.wave?.cooldownMs,
                DEFAULT_CONFIG.wave.cooldownMs,
                0,
                2000,
            ),
            windowMs: clampFinite(config?.wave?.windowMs, DEFAULT_CONFIG.wave.windowMs, 0, 2000),
            minAlternations: Math.round(
                clampFinite(
                    config?.wave?.minAlternations,
                    DEFAULT_CONFIG.wave.minAlternations,
                    0,
                    10,
                ),
            ),
            minElevationRad: finiteOrDefault(
                config?.wave?.minElevationRad,
                DEFAULT_CONFIG.wave.minElevationRad,
            ),
            minBodyLocalVelocityX: finiteOrDefault(
                config?.wave?.minBodyLocalVelocityX,
                DEFAULT_CONFIG.wave.minBodyLocalVelocityX,
            ),
            minImageVelocityX: finiteOrDefault(
                config?.wave?.minImageVelocityX,
                DEFAULT_CONFIG.wave.minImageVelocityX,
            ),
        },
        predictedSemanticHoldMs: clampFinite(
            config?.predictedSemanticHoldMs,
            DEFAULT_CONFIG.predictedSemanticHoldMs,
            200,
            700,
        ),
        sideSwapHoldMs: clampFinite(config?.sideSwapHoldMs, DEFAULT_CONFIG.sideSwapHoldMs, 0, 1000),
    };
}
