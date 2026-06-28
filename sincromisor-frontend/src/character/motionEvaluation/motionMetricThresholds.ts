/**
 * P0 fixture id、metric key、default threshold、metric definition を定義する。
 * threshold は regression severity の公開挙動に直結するため、変更時は motion design の QA regression と baseline tests を確認する。
 */
import type {
    MotionMetricConfig,
    MotionMetricDirection,
    MotionMetricKey,
    MotionMetricThreshold,
    MotionMetricUnit,
} from "./motionMetricTypes";

// metric group の境界は fixed key の順序、unit、direction、初期 threshold に限定する。
// 保存済み summary の parser、replay frame の検証、metric 計算本体はこの module では扱わない。
export const MOTION_P0_FIXTURE_IDS = [
    "neutral-10s",
    "single-arm-slow-raise",
    "both-arms-slow-raise",
    "hand-out-and-return",
    "arms-cross",
    "fast-wave",
] as const;

export type MotionP0FixtureId = (typeof MOTION_P0_FIXTURE_IDS)[number];

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

// 初期 threshold は motion.md の QA regression 契約値を移したもの。baseline 比較の互換性のため値を変えない。
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

export function resolveThresholds(
    config: MotionMetricConfig,
): Record<MotionMetricKey, MotionMetricThreshold> {
    return {
        neutralJitter:
            config.thresholds?.neutralJitter ?? DEFAULT_MOTION_METRIC_THRESHOLDS.neutralJitter,
        elbowFlipCount:
            config.thresholds?.elbowFlipCount ?? DEFAULT_MOTION_METRIC_THRESHOLDS.elbowFlipCount,
        recoveryJumpAngleDeg:
            config.thresholds?.recoveryJumpAngleDeg ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.recoveryJumpAngleDeg,
        angularVelocitySpikeCount:
            config.thresholds?.angularVelocitySpikeCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.angularVelocitySpikeCount,
        reachClampOccupancy:
            config.thresholds?.reachClampOccupancy ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.reachClampOccupancy,
        trackingLossDurationMs:
            config.thresholds?.trackingLossDurationMs ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.trackingLossDurationMs,
        sideSwapCount:
            config.thresholds?.sideSwapCount ?? DEFAULT_MOTION_METRIC_THRESHOLDS.sideSwapCount,
        addedLatencyMs:
            config.thresholds?.addedLatencyMs ?? DEFAULT_MOTION_METRIC_THRESHOLDS.addedLatencyMs,
        temporalPredictedArmFrameCount:
            config.thresholds?.temporalPredictedArmFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalPredictedArmFrameCount,
        temporalRecoveringArmFrameCount:
            config.thresholds?.temporalRecoveringArmFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalRecoveringArmFrameCount,
        temporalLostArmDurationMs:
            config.thresholds?.temporalLostArmDurationMs ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalLostArmDurationMs,
        temporalMaxRecoveryJumpDegEquivalent:
            config.thresholds?.temporalMaxRecoveryJumpDegEquivalent ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalMaxRecoveryJumpDegEquivalent,
        temporalNeutralWristJitter:
            config.thresholds?.temporalNeutralWristJitter ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalNeutralWristJitter,
        solverElbowFlipRejectCount:
            config.thresholds?.solverElbowFlipRejectCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.solverElbowFlipRejectCount,
        solverReachClampOccupancy:
            config.thresholds?.solverReachClampOccupancy ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.solverReachClampOccupancy,
        solverPoleUncertainFrameCount:
            config.thresholds?.solverPoleUncertainFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.solverPoleUncertainFrameCount,
        finalPoseAngularVelocityClampCount:
            config.thresholds?.finalPoseAngularVelocityClampCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.finalPoseAngularVelocityClampCount,
        finalPoseOwnedBoneConflictCount:
            config.thresholds?.finalPoseOwnedBoneConflictCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.finalPoseOwnedBoneConflictCount,
        gestureFlickerCount:
            config.thresholds?.gestureFlickerCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.gestureFlickerCount,
        semanticFallbackFrameCount:
            config.thresholds?.semanticFallbackFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.semanticFallbackFrameCount,
        intentCooldownSuppressionCount:
            config.thresholds?.intentCooldownSuppressionCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.intentCooldownSuppressionCount,
        intentInvalidFrameCount:
            config.thresholds?.intentInvalidFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.intentInvalidFrameCount,
        trackerBudgetOverrunFrameCount:
            config.thresholds?.trackerBudgetOverrunFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.trackerBudgetOverrunFrameCount,
        trackerDroppedFrameCount:
            config.thresholds?.trackerDroppedFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.trackerDroppedFrameCount,
        degradationStageFrameCount:
            config.thresholds?.degradationStageFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.degradationStageFrameCount,
        degradationRecoveryFrameCount:
            config.thresholds?.degradationRecoveryFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.degradationRecoveryFrameCount,
        roiPausedFrameCount:
            config.thresholds?.roiPausedFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.roiPausedFrameCount,
    };
}
