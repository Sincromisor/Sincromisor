import type { SincroMotionDebugFrame } from "../motionEvaluation/motionDebugLogSchema";
import {
    MOTION_METRIC_KEYS,
    MOTION_P0_FIXTURE_IDS,
    type MotionMetricKey,
    type MotionMetricStatus,
    type MotionP0FixtureId,
} from "../motionEvaluation/motionMetrics";
import type {
    MotionQaFixtureResult,
    MotionQaRegressionResult,
} from "../motionEvaluation/motionQaRegression";
import {
    type ArmMotionIntent,
    type MotionIntentSideState,
    parseMotionIntentState,
} from "../motionIntent/motionIntentState";
import { parseReliabilityMap } from "../reliability/reliabilityMap";

export const MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION =
    "sincro.motion-optimization-candidates.v1" as const;

export type MotionOptimizationCandidateTarget =
    | "constrained_ik_refinement"
    | "temporal_correction"
    | "gesture_sequence_classifier"
    | "anomaly_detector"
    | "performance_policy"
    | "do_not_optimize";

export type MotionOptimizationCandidate = {
    candidateId: string;
    fixtureId: MotionP0FixtureId | string;
    target: MotionOptimizationCandidateTarget;
    severity: "warn" | "fail";
    metricKeys: MotionMetricKey[];
    frameRange?: { startFrameIndex: number; endFrameIndex: number };
    evidence: Array<{
        metricKey: MotionMetricKey;
        value: number | null;
        status: MotionMetricStatus;
        message: string;
    }>;
    requiresHumanLabel: boolean;
    notes: string[];
};

export type MotionOptimizationCandidateReport = {
    schemaVersion: typeof MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION;
    generatedAtIso: string;
    sourceQaOverall: MotionQaRegressionResult["overall"];
    candidates: MotionOptimizationCandidate[];
    warnings: string[];
};

export type MotionOptimizationCandidateReportInput = {
    qaResult: MotionQaRegressionResult;
    framesByFixtureId?: Partial<Record<MotionP0FixtureId, readonly SincroMotionDebugFrame[]>>;
    generatedAtIso: string;
};

const TARGET_ORDER: MotionOptimizationCandidateTarget[] = [
    "constrained_ik_refinement",
    "temporal_correction",
    "gesture_sequence_classifier",
    "anomaly_detector",
    "performance_policy",
    "do_not_optimize",
];

const HUMAN_LABEL_TARGETS: MotionOptimizationCandidateTarget[] = [
    "constrained_ik_refinement",
    "temporal_correction",
    "gesture_sequence_classifier",
    "anomaly_detector",
];

const SEMANTIC_INTENTS: ArmMotionIntent[] = [
    "wave",
    "pointing",
    "thumbsUp",
    "peace",
    "nearFace",
    "explain",
    "clapLike",
    "guarded",
];

type CandidateEvidence = MotionOptimizationCandidate["evidence"][number];

type FrameRange = NonNullable<MotionOptimizationCandidate["frameRange"]>;

function targetForMetric(metricKey: MotionMetricKey): MotionOptimizationCandidateTarget {
    switch (metricKey) {
        case "elbowFlipCount":
        case "solverElbowFlipRejectCount":
        case "solverPoleUncertainFrameCount":
        case "solverReachClampOccupancy":
        case "reachClampOccupancy":
            return "constrained_ik_refinement";
        case "neutralJitter":
        case "recoveryJumpAngleDeg":
        case "temporalMaxRecoveryJumpDegEquivalent":
        case "temporalNeutralWristJitter":
        case "trackingLossDurationMs":
            return "temporal_correction";
        case "gestureFlickerCount":
        case "semanticFallbackFrameCount":
        case "intentCooldownSuppressionCount":
            return "gesture_sequence_classifier";
        case "sideSwapCount":
        case "intentInvalidFrameCount":
            return "anomaly_detector";
        case "trackerBudgetOverrunFrameCount":
        case "trackerDroppedFrameCount":
        case "degradationStageFrameCount":
        case "degradationRecoveryFrameCount":
        case "roiPausedFrameCount":
            return "performance_policy";
        case "angularVelocitySpikeCount":
        case "addedLatencyMs":
        case "temporalPredictedArmFrameCount":
        case "temporalRecoveringArmFrameCount":
        case "temporalLostArmDurationMs":
        case "finalPoseAngularVelocityClampCount":
        case "finalPoseOwnedBoneConflictCount":
            return "do_not_optimize";
    }
}

function notesForTarget(target: MotionOptimizationCandidateTarget): string[] {
    switch (target) {
        case "constrained_ik_refinement":
            return ["Review bounded IK refinement before enabling runtime changes."];
        case "temporal_correction":
            return ["Review replay frames before introducing learned temporal correction."];
        case "gesture_sequence_classifier":
            return [
                "Review gesture labels manually before treating sequence events as intent corrections.",
            ];
        case "anomaly_detector":
            return ["Review side assignment and invalid intent frames before automatic rejection."];
        case "performance_policy":
            return ["Performance policy candidates are not learned post-processing targets."];
        case "do_not_optimize":
            return [
                "No actionable Phase 11 optimization target was identified from available metrics.",
            ];
    }
}

function requiresHumanLabel(target: MotionOptimizationCandidateTarget): boolean {
    return HUMAN_LABEL_TARGETS.includes(target);
}

function isCandidateFixtureStatus(status: MotionQaFixtureResult["status"]): boolean {
    return status === "warn" || status === "fail";
}

function skippedFixtureWarning(fixture: MotionQaFixtureResult): string {
    const base = `fixture_skipped:${fixture.fixtureId}:${fixture.status}`;
    return fixture.errors.length > 0 ? `${base}:${fixture.errors.join("|")}` : base;
}

function isP0FixtureId(value: MotionP0FixtureId | string): value is MotionP0FixtureId {
    return MOTION_P0_FIXTURE_IDS.some((fixtureId) => fixtureId === value);
}

function framesForFixture(
    input: MotionOptimizationCandidateReportInput,
    fixtureId: MotionP0FixtureId | string,
): readonly SincroMotionDebugFrame[] | undefined {
    if (!isP0FixtureId(fixtureId)) {
        return undefined;
    }
    return input.framesByFixtureId?.[fixtureId];
}

function metricHasEvidence(fixture: MotionQaFixtureResult, metricKey: MotionMetricKey): boolean {
    const metric = fixture.summary?.metrics[metricKey];
    return (
        metric?.status === "warn" ||
        metric?.status === "fail" ||
        fixture.comparison?.[metricKey]?.status === "regressed"
    );
}

function createEvidence(
    fixture: MotionQaFixtureResult,
    metricKey: MotionMetricKey,
): CandidateEvidence | undefined {
    const metric = fixture.summary?.metrics[metricKey];
    if (metric === undefined || !metricHasEvidence(fixture, metricKey)) {
        return undefined;
    }
    const comparisonText =
        fixture.comparison?.[metricKey]?.status === "regressed" ? ", comparison=regressed" : "";
    const valueText = metric.value === null ? "null" : String(metric.value);
    return {
        metricKey,
        value: metric.value,
        status: metric.status,
        message: `${metricKey}: status=${metric.status}, value=${valueText}${comparisonText}`,
    };
}

function groupedMetricKeys(
    fixture: MotionQaFixtureResult,
): Map<MotionOptimizationCandidateTarget, MotionMetricKey[]> {
    const grouped = new Map<MotionOptimizationCandidateTarget, MotionMetricKey[]>();
    const unavailableMetricKeys: MotionMetricKey[] = [];
    for (const metricKey of MOTION_METRIC_KEYS) {
        const metric = fixture.summary?.metrics[metricKey];
        if (metric === undefined) {
            continue;
        }
        if (metricHasEvidence(fixture, metricKey)) {
            addGroupedMetric(grouped, targetForMetric(metricKey), metricKey);
            continue;
        }
        if (metric.status === "not_available") {
            unavailableMetricKeys.push(metricKey);
        }
    }

    if (grouped.size === 0 && unavailableMetricKeys.length > 0) {
        for (const metricKey of unavailableMetricKeys) {
            addGroupedMetric(grouped, "do_not_optimize", metricKey);
        }
    }

    if (grouped.size === 0 && fixture.summary === undefined) {
        grouped.set("do_not_optimize", []);
    }

    return grouped;
}

function addGroupedMetric(
    grouped: Map<MotionOptimizationCandidateTarget, MotionMetricKey[]>,
    target: MotionOptimizationCandidateTarget,
    metricKey: MotionMetricKey,
): void {
    const metricKeys = grouped.get(target);
    if (metricKeys === undefined) {
        grouped.set(target, [metricKey]);
        return;
    }
    metricKeys.push(metricKey);
}

function hasFailMetric(
    fixture: MotionQaFixtureResult,
    metricKeys: readonly MotionMetricKey[],
): boolean {
    return metricKeys.some((metricKey) => fixture.summary?.metrics[metricKey].severity === "fail");
}

function candidateSeverity(
    fixture: MotionQaFixtureResult,
    target: MotionOptimizationCandidateTarget,
    metricKeys: readonly MotionMetricKey[],
): MotionOptimizationCandidate["severity"] {
    if (hasFailMetric(fixture, metricKeys)) {
        return "fail";
    }
    if (fixture.status === "fail" && target !== "do_not_optimize") {
        return "fail";
    }
    return "warn";
}

function scanFrameRange(
    target: MotionOptimizationCandidateTarget,
    evidence: readonly CandidateEvidence[],
    frames: readonly SincroMotionDebugFrame[] | undefined,
): FrameRange | undefined {
    if (frames === undefined) {
        return undefined;
    }
    if (evidence.some((item) => item.metricKey === "gestureFlickerCount")) {
        return findGestureFlickerRange(frames);
    }
    if (
        target === "anomaly_detector" &&
        evidence.some((item) => item.metricKey === "sideSwapCount")
    ) {
        return findSideSwapRange(frames);
    }
    return undefined;
}

function isSemanticIntent(intent: ArmMotionIntent): boolean {
    return SEMANTIC_INTENTS.includes(intent);
}

function findGestureFlickerRange(
    frames: readonly SincroMotionDebugFrame[],
): FrameRange | undefined {
    const previous: Partial<
        Record<"left" | "right", { frameIndex: number; side: MotionIntentSideState }>
    > = {};
    for (const frame of frames) {
        const parsed = parseMotionIntentState(frame.intent);
        if (!parsed.ok) {
            continue;
        }
        for (const side of ["left", "right"] as const) {
            const current = parsed.state.arms[side];
            const previousSide = previous[side];
            if (
                previousSide !== undefined &&
                isSemanticIntent(previousSide.side.intent) &&
                previousSide.side.stableDurationMs < 150 &&
                (current.intent === "tracking" ||
                    (isSemanticIntent(current.intent) &&
                        current.intent !== previousSide.side.intent))
            ) {
                return {
                    startFrameIndex: previousSide.frameIndex,
                    endFrameIndex: frame.frameIndex,
                };
            }
            previous[side] = { frameIndex: frame.frameIndex, side: current };
        }
    }
    return undefined;
}

function findSideSwapRange(frames: readonly SincroMotionDebugFrame[]): FrameRange | undefined {
    for (const frame of frames) {
        const reliability = parseReliabilityMap(frame.reliability);
        if (
            reliability.ok &&
            (reliability.map.warnings.includes("side_inconsistent") ||
                Object.values(reliability.map.joints).some((joint) =>
                    joint.warnings.includes("side_inconsistent"),
                ) ||
                Object.values(reliability.map.parts).some((part) =>
                    part.warnings.includes("side_inconsistent"),
                ))
        ) {
            return { startFrameIndex: frame.frameIndex, endFrameIndex: frame.frameIndex };
        }

        const intent = parseMotionIntentState(frame.intent);
        if (
            intent.ok &&
            Object.values(intent.state.arms).some((arm) =>
                arm.warnings.includes("left_right_swap_suspect"),
            )
        ) {
            return { startFrameIndex: frame.frameIndex, endFrameIndex: frame.frameIndex };
        }
    }
    return undefined;
}

function shouldWarnFrameRangeMissing(
    target: MotionOptimizationCandidateTarget,
    evidence: readonly CandidateEvidence[],
): boolean {
    return (
        evidence.some((item) => item.metricKey === "gestureFlickerCount") ||
        (target === "anomaly_detector" &&
            evidence.some((item) => item.metricKey === "sideSwapCount"))
    );
}

function createCandidate(
    fixture: MotionQaFixtureResult,
    target: MotionOptimizationCandidateTarget,
    metricKeys: MotionMetricKey[],
    candidateIndex: number,
    input: MotionOptimizationCandidateReportInput,
    warnings: string[],
): MotionOptimizationCandidate {
    const evidence = metricKeys.flatMap((metricKey) => {
        const item = createEvidence(fixture, metricKey);
        return item === undefined ? [] : [item];
    });
    const frames = framesForFixture(input, fixture.fixtureId);
    const frameRange = scanFrameRange(target, evidence, frames);
    if (frameRange === undefined && shouldWarnFrameRangeMissing(target, evidence)) {
        warnings.push(`frame_range_not_found:${fixture.fixtureId}:${target}`);
    }
    return {
        candidateId: `${fixture.fixtureId}:${target}:${candidateIndex}`,
        fixtureId: fixture.fixtureId,
        target,
        severity: candidateSeverity(fixture, target, metricKeys),
        metricKeys,
        ...(frameRange === undefined ? {} : { frameRange }),
        evidence,
        requiresHumanLabel: requiresHumanLabel(target),
        notes: notesForTarget(target),
    };
}

export function analyzeMotionOptimizationCandidates(
    input: MotionOptimizationCandidateReportInput,
): MotionOptimizationCandidateReport {
    const candidates: MotionOptimizationCandidate[] = [];
    const warnings: string[] = [];

    for (const fixture of input.qaResult.fixtures) {
        if (!isCandidateFixtureStatus(fixture.status)) {
            warnings.push(skippedFixtureWarning(fixture));
            continue;
        }

        const grouped = groupedMetricKeys(fixture);
        let candidateIndex = 0;
        for (const target of TARGET_ORDER) {
            const metricKeys = grouped.get(target);
            if (metricKeys === undefined) {
                continue;
            }
            candidates.push(
                createCandidate(fixture, target, metricKeys, candidateIndex, input, warnings),
            );
            candidateIndex += 1;
        }
    }

    return {
        schemaVersion: MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION,
        generatedAtIso: input.generatedAtIso,
        sourceQaOverall: input.qaResult.overall,
        candidates,
        warnings,
    };
}
