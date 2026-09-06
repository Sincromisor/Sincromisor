/**
 * Motion QA regression の fixture id、metric key、threshold 定義を固定する contract module。
 *
 * ここで定義する key 順序と threshold は baseline JSON、summary severity、optimization candidate
 * 分類の結合点になる。metric 計算、旧 log fallback、summary parser は別 module の責務である。
 */
import type {
    MotionMetricConfig,
    MotionMetricDirection,
    MotionMetricKey,
    MotionMetricThreshold,
    MotionMetricUnit,
} from "./motionMetricTypes";

/**
 * Motion QA regression の P0 fixture id。
 *
 * subset 実行時の明示 id と manifest validation の結合キーであり、ここに無い id は自動 fallback しない。
 * 追加・削除時は manifest tests と motion-debug の fixture selection を同時に確認する。
 */
export const MOTION_P0_FIXTURE_IDS = [
    "neutral-10s",
    "single-arm-slow-raise",
    "both-arms-slow-raise",
    "hand-out-and-return",
    "arms-cross",
    "fast-wave",
    "left-arm-occlusion-recovery",
    "right-arm-occlusion-recovery",
] as const;

/**
 * P0 fixture manifest で受理する fixture id。
 *
 * 型は `MOTION_P0_FIXTURE_IDS` から生成し、文字列 literal の重複定義で manifest validation とずれないようにする。
 */
export type MotionP0FixtureId = (typeof MOTION_P0_FIXTURE_IDS)[number];

/**
 * Motion metric summary / baseline / comparison を結合する固定 key 順序。
 *
 * 新しい key を足す場合、`DEFAULT_MOTION_METRIC_THRESHOLDS` と `METRIC_DEFINITIONS` へ同時に追加する。
 * missing key は旧 baseline 互換では `not_available` として補完されるため、key rename は既存 baseline の
 * severity を変える破壊的変更になる。
 */
export const MOTION_METRIC_KEYS: MotionMetricKey[] = [
    "neutralJitter",
    "elbowFlipCount",
    "recoveryJumpAngleDeg",
    "angularVelocitySpikeCount",
    "reachClampOccupancy",
    "trackingLossDurationMs",
    "sideSwapCount",
    "addedLatencyMs",
    "temporalPredictedArmFrameCount",
    "temporalRecoveringArmFrameCount",
    "temporalLostArmDurationMs",
    "temporalMaxRecoveryJumpDegEquivalent",
    "temporalNeutralWristJitter",
    "solverElbowFlipRejectCount",
    "solverReachClampOccupancy",
    "solverExcessReachRatioP95",
    "solverPoleUncertainFrameCount",
    "finalPoseAngularVelocityClampCount",
    "finalPoseOwnedBoneConflictCount",
    "gestureFlickerCount",
    "semanticFallbackFrameCount",
    "intentCooldownSuppressionCount",
    "intentInvalidFrameCount",
    "trackerBudgetOverrunFrameCount",
    "trackerDroppedFrameCount",
    "degradationStageFrameCount",
    "degradationRecoveryFrameCount",
    "roiPausedFrameCount",
];

/**
 * Motion QA regression の default threshold。
 *
 * 値は Phase 10 の QA baseline 契約から来ており、低いほど厳しい metric と count/duration 系が混在する。
 * 下げすぎると neutral jitter、tracker budget、ROI pause のような環境依存 metric が false fail になり、
 * 上げすぎると elbow flip、side swap、semantic fallback の見た目の破綻を PASS へ隠す。調整時は
 * `motionMetrics` / `motionQaRegression` tests と P0 fixture replay summary を確認する。
 */
export const DEFAULT_MOTION_METRIC_THRESHOLDS: Record<MotionMetricKey, MotionMetricThreshold> = {
    neutralJitter: { pass: 0.015, warn: 0.035, fail: 0.06 },
    elbowFlipCount: { pass: 0, warn: 2, fail: 5 },
    recoveryJumpAngleDeg: { pass: 8, warn: 18, fail: 35 },
    angularVelocitySpikeCount: { pass: 0, warn: 3, fail: 8 },
    reachClampOccupancy: { pass: 0.05, warn: 0.18, fail: 0.35 },
    trackingLossDurationMs: { pass: 250, warn: 1000, fail: 2500 },
    sideSwapCount: { pass: 0, warn: 1, fail: 3 },
    addedLatencyMs: { pass: 80, warn: 160, fail: 260 },
    temporalPredictedArmFrameCount: { pass: 0, warn: 40, fail: 120 },
    temporalRecoveringArmFrameCount: { pass: 0, warn: 30, fail: 90 },
    temporalLostArmDurationMs: { pass: 250, warn: 1000, fail: 2500 },
    temporalMaxRecoveryJumpDegEquivalent: { pass: 15, warn: 25, fail: 45 },
    temporalNeutralWristJitter: { pass: 0.015, warn: 0.035, fail: 0.06 },
    solverElbowFlipRejectCount: { pass: 1, warn: 3, fail: 3 },
    solverReachClampOccupancy: { pass: 0.2, warn: 0.4, fail: 0.4 },
    solverExcessReachRatioP95: { pass: 0.05, warn: 0.1, fail: 0.1 },
    solverPoleUncertainFrameCount: { pass: 2, warn: 5, fail: 5 },
    finalPoseAngularVelocityClampCount: { pass: 0, warn: 2, fail: 2 },
    finalPoseOwnedBoneConflictCount: { pass: 0, warn: 0, fail: 0 },
    gestureFlickerCount: { pass: 0, warn: 2, fail: 5 },
    semanticFallbackFrameCount: { pass: 30, warn: 120, fail: 240 },
    intentCooldownSuppressionCount: { pass: 0, warn: 20, fail: 60 },
    intentInvalidFrameCount: { pass: 0, warn: 1, fail: 3 },
    trackerBudgetOverrunFrameCount: { pass: 0, warn: 30, fail: 90 },
    trackerDroppedFrameCount: { pass: 0, warn: 15, fail: 60 },
    degradationStageFrameCount: { pass: 0, warn: 45, fail: 150 },
    degradationRecoveryFrameCount: { pass: 0, warn: 60, fail: 180 },
    roiPausedFrameCount: { pass: 0, warn: 60, fail: 180 },
};

/**
 * 各 metric の単位と severity 比較方向。
 *
 * 現行 metric はすべて `lower_is_better` であり、direction を変えると baseline comparison の regression
 * 判定が反転する。unit は UI 表示と report 解釈用で、計算値の正規化は calculator 側で行う。
 */
export const METRIC_DEFINITIONS: Record<
    MotionMetricKey,
    { unit: MotionMetricUnit; direction: MotionMetricDirection }
> = {
    neutralJitter: { unit: "ratio", direction: "lower_is_better" },
    elbowFlipCount: { unit: "count", direction: "lower_is_better" },
    recoveryJumpAngleDeg: { unit: "deg", direction: "lower_is_better" },
    angularVelocitySpikeCount: { unit: "count", direction: "lower_is_better" },
    reachClampOccupancy: { unit: "ratio", direction: "lower_is_better" },
    trackingLossDurationMs: { unit: "ms", direction: "lower_is_better" },
    sideSwapCount: { unit: "count", direction: "lower_is_better" },
    addedLatencyMs: { unit: "ms", direction: "lower_is_better" },
    temporalPredictedArmFrameCount: { unit: "count", direction: "lower_is_better" },
    temporalRecoveringArmFrameCount: { unit: "count", direction: "lower_is_better" },
    temporalLostArmDurationMs: { unit: "ms", direction: "lower_is_better" },
    temporalMaxRecoveryJumpDegEquivalent: { unit: "deg", direction: "lower_is_better" },
    temporalNeutralWristJitter: { unit: "ratio", direction: "lower_is_better" },
    solverElbowFlipRejectCount: { unit: "count", direction: "lower_is_better" },
    solverReachClampOccupancy: { unit: "ratio", direction: "lower_is_better" },
    solverExcessReachRatioP95: { unit: "ratio", direction: "lower_is_better" },
    solverPoleUncertainFrameCount: { unit: "count", direction: "lower_is_better" },
    finalPoseAngularVelocityClampCount: { unit: "count", direction: "lower_is_better" },
    finalPoseOwnedBoneConflictCount: { unit: "count", direction: "lower_is_better" },
    gestureFlickerCount: { unit: "count", direction: "lower_is_better" },
    semanticFallbackFrameCount: { unit: "count", direction: "lower_is_better" },
    intentCooldownSuppressionCount: { unit: "count", direction: "lower_is_better" },
    intentInvalidFrameCount: { unit: "count", direction: "lower_is_better" },
    trackerBudgetOverrunFrameCount: { unit: "count", direction: "lower_is_better" },
    trackerDroppedFrameCount: { unit: "count", direction: "lower_is_better" },
    degradationStageFrameCount: { unit: "count", direction: "lower_is_better" },
    degradationRecoveryFrameCount: { unit: "count", direction: "lower_is_better" },
    roiPausedFrameCount: { unit: "count", direction: "lower_is_better" },
};

/**
 * 呼び出し元が指定した閾値を既定値に重ね、全指標の設定を返す。
 *
 * 値域の検証は呼び出し元に委ねる。既知のキーだけを取り込み、明示された undefined も既定値で補う。
 */
export function resolveThresholds(
    config: MotionMetricConfig,
): Record<MotionMetricKey, MotionMetricThreshold> {
    const thresholds = { ...DEFAULT_MOTION_METRIC_THRESHOLDS };
    for (const key of MOTION_METRIC_KEYS) {
        thresholds[key] = config.thresholds?.[key] ?? DEFAULT_MOTION_METRIC_THRESHOLDS[key];
    }
    return thresholds;
}
