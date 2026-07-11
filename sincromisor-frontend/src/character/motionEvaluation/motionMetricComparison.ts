/**
 * candidate summary と baseline summary を metric key 単位で比較する。
 * regression 判定は threshold と direction を正本にし、保存済み baseline 自体の parse / fallback は別 module に残す。
 */
import type {
    MotionMetricComparison,
    MotionMetricKey,
    MotionMetricResult,
    MotionMetricSeverity,
    MotionMetricSummary,
    MotionMetricUnit,
} from "./motionMetricTypes";

// comparison は保存済み summary 同士を deterministic key order で比較する境界。
// metric 値の再計算、threshold 定義、旧 baseline の missing key 補完はこの module では扱わない。
function severityRank(severity: MotionMetricSeverity): number {
    if (severity === "pass") {
        return 0;
    }
    if (severity === "warn") {
        return 1;
    }
    return 2;
}

// ratio は保存・計算経路の丸め差を 1% まで同一扱いし、count は 1 件差を regression として残す。
function comparisonTolerance(unit: MotionMetricUnit): number {
    if (unit === "ratio") {
        return 0.01;
    }
    if (unit === "count") {
        return 0;
    }
    return 1;
}

function compareSameSeverity(
    candidate: MotionMetricResult,
    delta: number,
): MotionMetricComparison["status"] {
    const tolerance = comparisonTolerance(candidate.unit);
    if (Math.abs(delta) <= tolerance) {
        return "unchanged";
    }
    if (candidate.direction === "lower_is_better") {
        return delta < 0 ? "improved" : "regressed";
    }
    return delta > 0 ? "improved" : "regressed";
}

export function compareMotionMetricSummaries(
    baseline: MotionMetricSummary,
    candidate: MotionMetricSummary,
): Record<MotionMetricKey, MotionMetricComparison> {
    return {
        neutralJitter: compareMetric("neutralJitter", baseline, candidate),
        elbowFlipCount: compareMetric("elbowFlipCount", baseline, candidate),
        recoveryJumpAngleDeg: compareMetric("recoveryJumpAngleDeg", baseline, candidate),
        angularVelocitySpikeCount: compareMetric("angularVelocitySpikeCount", baseline, candidate),
        reachClampOccupancy: compareMetric("reachClampOccupancy", baseline, candidate),
        trackingLossDurationMs: compareMetric("trackingLossDurationMs", baseline, candidate),
        sideSwapCount: compareMetric("sideSwapCount", baseline, candidate),
        addedLatencyMs: compareMetric("addedLatencyMs", baseline, candidate),
        temporalPredictedArmFrameCount: compareMetric(
            "temporalPredictedArmFrameCount",
            baseline,
            candidate,
        ),
        temporalRecoveringArmFrameCount: compareMetric(
            "temporalRecoveringArmFrameCount",
            baseline,
            candidate,
        ),
        temporalLostArmDurationMs: compareMetric("temporalLostArmDurationMs", baseline, candidate),
        temporalMaxRecoveryJumpDegEquivalent: compareMetric(
            "temporalMaxRecoveryJumpDegEquivalent",
            baseline,
            candidate,
        ),
        temporalNeutralWristJitter: compareMetric(
            "temporalNeutralWristJitter",
            baseline,
            candidate,
        ),
        solverElbowFlipRejectCount: compareMetric(
            "solverElbowFlipRejectCount",
            baseline,
            candidate,
        ),
        solverReachClampOccupancy: compareMetric("solverReachClampOccupancy", baseline, candidate),
        solverExcessReachRatioP95: compareMetric("solverExcessReachRatioP95", baseline, candidate),
        solverPoleUncertainFrameCount: compareMetric(
            "solverPoleUncertainFrameCount",
            baseline,
            candidate,
        ),
        finalPoseAngularVelocityClampCount: compareMetric(
            "finalPoseAngularVelocityClampCount",
            baseline,
            candidate,
        ),
        finalPoseOwnedBoneConflictCount: compareMetric(
            "finalPoseOwnedBoneConflictCount",
            baseline,
            candidate,
        ),
        gestureFlickerCount: compareMetric("gestureFlickerCount", baseline, candidate),
        semanticFallbackFrameCount: compareMetric(
            "semanticFallbackFrameCount",
            baseline,
            candidate,
        ),
        intentCooldownSuppressionCount: compareMetric(
            "intentCooldownSuppressionCount",
            baseline,
            candidate,
        ),
        intentInvalidFrameCount: compareMetric("intentInvalidFrameCount", baseline, candidate),
        trackerBudgetOverrunFrameCount: compareMetric(
            "trackerBudgetOverrunFrameCount",
            baseline,
            candidate,
        ),
        trackerDroppedFrameCount: compareMetric("trackerDroppedFrameCount", baseline, candidate),
        degradationStageFrameCount: compareMetric(
            "degradationStageFrameCount",
            baseline,
            candidate,
        ),
        degradationRecoveryFrameCount: compareMetric(
            "degradationRecoveryFrameCount",
            baseline,
            candidate,
        ),
        roiPausedFrameCount: compareMetric("roiPausedFrameCount", baseline, candidate),
    };
}

function compareMetric(
    key: MotionMetricKey,
    baseline: MotionMetricSummary,
    candidate: MotionMetricSummary,
): MotionMetricComparison {
    const baselineMetric = baseline.metrics[key];
    const candidateMetric = candidate.metrics[key];
    const severityDelta =
        severityRank(candidateMetric.severity) - severityRank(baselineMetric.severity);
    const severityChanged = severityDelta !== 0;
    if (
        baselineMetric.status === "not_available" ||
        candidateMetric.status === "not_available" ||
        baselineMetric.value === null ||
        candidateMetric.value === null
    ) {
        return {
            key,
            status: "not_comparable",
            baselineValue: baselineMetric.value,
            candidateValue: candidateMetric.value,
            delta: null,
            severityChanged,
        };
    }

    const delta = candidateMetric.value - baselineMetric.value;
    return {
        key,
        status:
            severityDelta < 0
                ? "improved"
                : severityDelta > 0
                  ? "regressed"
                  : compareSameSeverity(candidateMetric, delta),
        baselineValue: baselineMetric.value,
        candidateValue: candidateMetric.value,
        delta,
        severityChanged,
    };
}
