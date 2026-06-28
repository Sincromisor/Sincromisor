/**
 * replay frame 群から MotionMetricSummary を作る集約入口。
 * metric key 順序、threshold、not_available 方針を固定し、QA regression harness が同じ summary contract を読めるようにする。
 */
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import {
    calculateAddedLatencyMs,
    calculateElbowFlipCount,
    calculateNeutralJitter,
    calculateReachClampOccupancy,
    calculateSideSwapCount,
    calculateTrackingLossDurationMs,
} from "./motionMetricBaseCalculators";
import {
    calculateGestureFlickerCount,
    calculateIntentCooldownSuppressionCount,
    calculateIntentInvalidFrameCount,
    calculateSemanticFallbackFrameCount,
} from "./motionMetricIntentCalculators";
import {
    calculateAngularVelocitySpikeCount,
    calculateFinalPoseAngularVelocityClampCount,
    calculateFinalPoseOwnedBoneConflictCount,
    calculateSolverElbowFlipRejectCount,
    calculateSolverPoleUncertainFrameCount,
    calculateSolverReachClampOccupancy,
} from "./motionMetricSolverCalculators";
import {
    calculateRecoveryJumpAngleDeg,
    calculateTemporalArmStateCount,
    calculateTemporalLostArmDurationMs,
    calculateTemporalMaxRecoveryJumpDegEquivalent,
    calculateTemporalNeutralWristJitter,
} from "./motionMetricTemporalCalculators";
import {
    METRIC_DEFINITIONS,
    MOTION_METRIC_KEYS,
    resolveThresholds,
} from "./motionMetricThresholds";
import {
    calculateDegradationRecoveryFrameCount,
    calculateDegradationStageFrameCount,
    calculateRoiPausedFrameCount,
    calculateTrackerBudgetOverrunFrameCount,
    calculateTrackerDroppedFrameCount,
} from "./motionMetricTrackerCalculators";
import type {
    MotionMetricConfig,
    MotionMetricDirection,
    MotionMetricKey,
    MotionMetricResult,
    MotionMetricSeverity,
    MotionMetricSummary,
    MotionMetricThreshold,
    NumericMetricComputation,
} from "./motionMetricTypes";

// summary は metric group calculator の結果を sincro.motion-metrics.v1 保存 contract に集約する。
// replay frame の Zod 境界、threshold 定義、baseline comparison はこの module では扱わない。
function statusForValue(
    value: number,
    threshold: MotionMetricThreshold,
    direction: MotionMetricDirection,
): MotionMetricSeverity {
    if (direction === "lower_is_better") {
        if (value <= threshold.pass) {
            return "pass";
        }
        if (value <= threshold.warn) {
            return "warn";
        }
        return "fail";
    }

    if (value >= threshold.pass) {
        return "pass";
    }
    if (value >= threshold.warn) {
        return "warn";
    }
    return "fail";
}

function createMetricResult(
    key: MotionMetricKey,
    threshold: MotionMetricThreshold,
    computation: NumericMetricComputation,
): MotionMetricResult {
    const definition = METRIC_DEFINITIONS[key];
    if (!computation.ok) {
        return {
            key,
            value: null,
            unit: definition.unit,
            status: "not_available",
            severity: "warn",
            direction: definition.direction,
            threshold,
            sampleCount: computation.sampleCount,
            unavailableReason: computation.reason,
        };
    }

    const severity = statusForValue(computation.value, threshold, definition.direction);
    return {
        key,
        value: computation.value,
        unit: definition.unit,
        status: severity,
        severity,
        direction: definition.direction,
        threshold,
        sampleCount: computation.sampleCount,
    };
}

function maxSeverity(results: Record<MotionMetricKey, MotionMetricResult>): MotionMetricSeverity {
    if (MOTION_METRIC_KEYS.some((key) => results[key].severity === "fail")) {
        return "fail";
    }
    if (MOTION_METRIC_KEYS.some((key) => results[key].severity === "warn")) {
        return "warn";
    }
    return "pass";
}

function calculateDurationMs(frames: readonly SincroMotionDebugFrame[]): number {
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (first === undefined || last === undefined) {
        return 0;
    }
    return Math.max(0, last.timestamp.mediaTimeMs - first.timestamp.mediaTimeMs);
}

export function calculateMotionMetricSummary(
    frames: readonly SincroMotionDebugFrame[],
    config: MotionMetricConfig,
): MotionMetricSummary {
    const thresholds = resolveThresholds(config);
    const metrics: Record<MotionMetricKey, MotionMetricResult> = {
        neutralJitter: createMetricResult(
            "neutralJitter",
            thresholds.neutralJitter,
            calculateNeutralJitter(frames, config.fixtureId),
        ),
        elbowFlipCount: createMetricResult(
            "elbowFlipCount",
            thresholds.elbowFlipCount,
            calculateElbowFlipCount(frames),
        ),
        recoveryJumpAngleDeg: createMetricResult(
            "recoveryJumpAngleDeg",
            thresholds.recoveryJumpAngleDeg,
            calculateRecoveryJumpAngleDeg(frames),
        ),
        angularVelocitySpikeCount: createMetricResult(
            "angularVelocitySpikeCount",
            thresholds.angularVelocitySpikeCount,
            calculateAngularVelocitySpikeCount(frames),
        ),
        reachClampOccupancy: createMetricResult(
            "reachClampOccupancy",
            thresholds.reachClampOccupancy,
            calculateReachClampOccupancy(frames),
        ),
        trackingLossDurationMs: createMetricResult(
            "trackingLossDurationMs",
            thresholds.trackingLossDurationMs,
            calculateTrackingLossDurationMs(frames),
        ),
        sideSwapCount: createMetricResult(
            "sideSwapCount",
            thresholds.sideSwapCount,
            calculateSideSwapCount(frames),
        ),
        addedLatencyMs: createMetricResult(
            "addedLatencyMs",
            thresholds.addedLatencyMs,
            calculateAddedLatencyMs(frames),
        ),
        temporalPredictedArmFrameCount: createMetricResult(
            "temporalPredictedArmFrameCount",
            thresholds.temporalPredictedArmFrameCount,
            calculateTemporalArmStateCount(frames, "predicted"),
        ),
        temporalRecoveringArmFrameCount: createMetricResult(
            "temporalRecoveringArmFrameCount",
            thresholds.temporalRecoveringArmFrameCount,
            calculateTemporalArmStateCount(frames, "recovering"),
        ),
        temporalLostArmDurationMs: createMetricResult(
            "temporalLostArmDurationMs",
            thresholds.temporalLostArmDurationMs,
            calculateTemporalLostArmDurationMs(frames),
        ),
        temporalMaxRecoveryJumpDegEquivalent: createMetricResult(
            "temporalMaxRecoveryJumpDegEquivalent",
            thresholds.temporalMaxRecoveryJumpDegEquivalent,
            calculateTemporalMaxRecoveryJumpDegEquivalent(frames),
        ),
        temporalNeutralWristJitter: createMetricResult(
            "temporalNeutralWristJitter",
            thresholds.temporalNeutralWristJitter,
            calculateTemporalNeutralWristJitter(frames, config.fixtureId),
        ),
        solverElbowFlipRejectCount: createMetricResult(
            "solverElbowFlipRejectCount",
            thresholds.solverElbowFlipRejectCount,
            calculateSolverElbowFlipRejectCount(frames),
        ),
        solverReachClampOccupancy: createMetricResult(
            "solverReachClampOccupancy",
            thresholds.solverReachClampOccupancy,
            calculateSolverReachClampOccupancy(frames),
        ),
        solverPoleUncertainFrameCount: createMetricResult(
            "solverPoleUncertainFrameCount",
            thresholds.solverPoleUncertainFrameCount,
            calculateSolverPoleUncertainFrameCount(frames),
        ),
        finalPoseAngularVelocityClampCount: createMetricResult(
            "finalPoseAngularVelocityClampCount",
            thresholds.finalPoseAngularVelocityClampCount,
            calculateFinalPoseAngularVelocityClampCount(frames),
        ),
        finalPoseOwnedBoneConflictCount: createMetricResult(
            "finalPoseOwnedBoneConflictCount",
            thresholds.finalPoseOwnedBoneConflictCount,
            calculateFinalPoseOwnedBoneConflictCount(frames),
        ),
        gestureFlickerCount: createMetricResult(
            "gestureFlickerCount",
            thresholds.gestureFlickerCount,
            calculateGestureFlickerCount(frames),
        ),
        semanticFallbackFrameCount: createMetricResult(
            "semanticFallbackFrameCount",
            thresholds.semanticFallbackFrameCount,
            calculateSemanticFallbackFrameCount(frames),
        ),
        intentCooldownSuppressionCount: createMetricResult(
            "intentCooldownSuppressionCount",
            thresholds.intentCooldownSuppressionCount,
            calculateIntentCooldownSuppressionCount(frames),
        ),
        intentInvalidFrameCount: createMetricResult(
            "intentInvalidFrameCount",
            thresholds.intentInvalidFrameCount,
            calculateIntentInvalidFrameCount(frames),
        ),
        trackerBudgetOverrunFrameCount: createMetricResult(
            "trackerBudgetOverrunFrameCount",
            thresholds.trackerBudgetOverrunFrameCount,
            calculateTrackerBudgetOverrunFrameCount(frames),
        ),
        trackerDroppedFrameCount: createMetricResult(
            "trackerDroppedFrameCount",
            thresholds.trackerDroppedFrameCount,
            calculateTrackerDroppedFrameCount(frames),
        ),
        degradationStageFrameCount: createMetricResult(
            "degradationStageFrameCount",
            thresholds.degradationStageFrameCount,
            calculateDegradationStageFrameCount(frames),
        ),
        degradationRecoveryFrameCount: createMetricResult(
            "degradationRecoveryFrameCount",
            thresholds.degradationRecoveryFrameCount,
            calculateDegradationRecoveryFrameCount(frames),
        ),
        roiPausedFrameCount: createMetricResult(
            "roiPausedFrameCount",
            thresholds.roiPausedFrameCount,
            calculateRoiPausedFrameCount(frames),
        ),
    };

    return {
        schemaVersion: "sincro.motion-metrics.v1",
        fixtureId: config.fixtureId,
        generatedAtIso: config.generatedAtIso,
        frameCount: frames.length,
        durationMs: calculateDurationMs(frames),
        severity: maxSeverity(metrics),
        metrics,
    };
}
