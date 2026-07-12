import { describe, expect, it } from "vitest";
import {
    createLogText,
    logLines,
} from "../../motionEvaluation/__tests__/motionQaRegressionTestFixtures";
import {
    parseMotionDebugLogLines,
    type SincroMotionDebugFrame,
} from "../../motionEvaluation/motionDebugLogSchema";
import {
    calculateMotionMetricSummary,
    compareMotionMetricSummaries,
    MOTION_METRIC_KEYS,
    type MotionMetricKey,
    type MotionMetricResult,
    type MotionMetricSummary,
} from "../../motionEvaluation/motionMetrics";
import type {
    MotionQaFixtureResult,
    MotionQaRegressionResult,
} from "../../motionEvaluation/motionQaRegression";
import { createDefaultMotionIntentState } from "../../motionIntent/motionIntentState";
import { createDefaultReliabilityMap } from "../../reliability/reliabilityMap";
import {
    analyzeMotionOptimizationCandidates,
    MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION,
} from "../motionOptimizationCandidateReport";

const GENERATED_AT_ISO = "2026-06-28T07:20:00.000Z";

function baseSummary(): MotionMetricSummary {
    const parsed = parseMotionDebugLogLines(logLines(createLogText("neutral-10s")));
    if (!parsed.ok) {
        throw new Error("Synthetic motion QA log should parse.");
    }
    return calculateMotionMetricSummary(parsed.frames, {
        fixtureId: "neutral-10s",
        generatedAtIso: GENERATED_AT_ISO,
        thresholdVersion: "initial-v1",
    });
}

function createSummary(
    overrides: Partial<Record<MotionMetricKey, Partial<MotionMetricResult>>> = {},
): MotionMetricSummary {
    const summary = baseSummary();
    const metrics = { ...summary.metrics };
    for (const metricKey of MOTION_METRIC_KEYS) {
        const override = overrides[metricKey];
        if (override !== undefined) {
            metrics[metricKey] = { ...metrics[metricKey], ...override, key: metricKey };
        }
    }
    return { ...summary, metrics };
}

function createFixture(
    fixtureId: MotionQaFixtureResult["fixtureId"],
    status: MotionQaFixtureResult["status"],
    summary?: MotionMetricSummary,
): MotionQaFixtureResult {
    const fixture = {
        fixtureId,
        status,
        subjectiveChecklist: [],
        errors: [],
    };
    return summary === undefined ? fixture : { ...fixture, summary };
}

function createQaResult(fixtures: MotionQaFixtureResult[]): MotionQaRegressionResult {
    return {
        schemaVersion: "sincro.motion-qa-regression.v1",
        overall: fixtures.some((fixture) => fixture.status === "fail") ? "fail" : "warn",
        fixtures,
    };
}

function createIntentFrame(
    frameIndex: number,
    leftIntent: ReturnType<typeof createDefaultMotionIntentState>["arms"]["left"]["intent"],
    stableDurationMs: number,
): SincroMotionDebugFrame {
    const intent = createDefaultMotionIntentState(frameIndex * 100);
    return {
        frameIndex,
        timestamp: { mediaTimeMs: frameIndex * 100 },
        video: { width: 1280, height: 720 },
        intent: {
            ...intent,
            arms: {
                ...intent.arms,
                left: {
                    ...intent.arms.left,
                    intent: leftIntent,
                    stableDurationMs,
                },
            },
        },
    };
}

function createSideSwapFrame(frameIndex: number): SincroMotionDebugFrame {
    return {
        frameIndex,
        timestamp: { mediaTimeMs: frameIndex * 100 },
        video: { width: 1280, height: 720 },
        reliability: {
            ...createDefaultReliabilityMap(frameIndex * 100),
            warnings: ["side_inconsistent"],
        },
    };
}

describe("analyzeMotionOptimizationCandidates", () => {
    it("groups IK, temporal, anomaly, and performance metrics in deterministic target order", () => {
        const summary = createSummary({
            elbowFlipCount: { value: 2, status: "warn", severity: "warn" },
            solverElbowFlipRejectCount: { value: 4, status: "fail", severity: "fail" },
            neutralJitter: { value: 0.04, status: "warn", severity: "warn" },
            sideSwapCount: { value: 3, status: "fail", severity: "fail" },
            trackerDroppedFrameCount: { value: 20, status: "warn", severity: "warn" },
        });

        const report = analyzeMotionOptimizationCandidates({
            qaResult: createQaResult([createFixture("neutral-10s", "fail", summary)]),
            generatedAtIso: GENERATED_AT_ISO,
        });

        expect(report.schemaVersion).toBe(MOTION_OPTIMIZATION_CANDIDATE_REPORT_SCHEMA_VERSION);
        expect(report.candidates.map((candidate) => candidate.target)).toEqual([
            "constrained_ik_refinement",
            "temporal_correction",
            "anomaly_detector",
            "performance_policy",
        ]);
        expect(report.candidates.map((candidate) => candidate.candidateId)).toEqual([
            "neutral-10s:constrained_ik_refinement:0",
            "neutral-10s:temporal_correction:1",
            "neutral-10s:anomaly_detector:2",
            "neutral-10s:performance_policy:3",
        ]);
        expect(report.candidates[0]).toMatchObject({
            severity: "fail",
            metricKeys: ["elbowFlipCount", "solverElbowFlipRejectCount"],
            requiresHumanLabel: true,
            notes: ["Review bounded IK refinement before enabling runtime changes."],
        });
        expect(report.candidates[0]?.evidence).toEqual([
            {
                metricKey: "elbowFlipCount",
                value: 2,
                status: "warn",
                message: "elbowFlipCount: status=warn, value=2",
            },
            {
                metricKey: "solverElbowFlipRejectCount",
                value: 4,
                status: "fail",
                message: "solverElbowFlipRejectCount: status=fail, value=4",
            },
        ]);
        expect(report.candidates[3]).toMatchObject({
            target: "performance_policy",
            requiresHumanLabel: false,
            notes: ["Performance policy candidates are not learned post-processing targets."],
        });
    });

    it("classifies temporal, gesture, anomaly, and performance comparison regressions", () => {
        const summary = createSummary({
            recoveryJumpAngleDeg: { value: 10, status: "pass", severity: "pass" },
            gestureFlickerCount: { value: 1, status: "pass", severity: "pass" },
            intentInvalidFrameCount: { value: 1, status: "warn", severity: "warn" },
            degradationStageFrameCount: { value: 60, status: "warn", severity: "warn" },
        });
        const fixture = createFixture("fast-wave", "warn", summary);
        fixture.comparison = compareMotionMetricSummaries(summary, summary);
        fixture.comparison.recoveryJumpAngleDeg = {
            key: "recoveryJumpAngleDeg",
            status: "regressed",
            baselineValue: 5,
            candidateValue: 10,
            delta: 5,
            severityChanged: false,
        };
        fixture.comparison.gestureFlickerCount = {
            key: "gestureFlickerCount",
            status: "regressed",
            baselineValue: 0,
            candidateValue: 1,
            delta: 1,
            severityChanged: false,
        };

        const report = analyzeMotionOptimizationCandidates({
            qaResult: createQaResult([fixture]),
            framesByFixtureId: {
                "fast-wave": [
                    createIntentFrame(0, "wave", 120),
                    createIntentFrame(1, "tracking", 0),
                ],
            },
            generatedAtIso: GENERATED_AT_ISO,
        });

        expect(report.candidates.map((candidate) => candidate.target)).toEqual([
            "temporal_correction",
            "gesture_sequence_classifier",
            "anomaly_detector",
            "performance_policy",
        ]);
        expect(report.candidates[0]?.evidence[0]?.message).toBe(
            "recoveryJumpAngleDeg: status=pass, value=10, comparison=regressed",
        );
        expect(report.candidates[1]).toMatchObject({
            target: "gesture_sequence_classifier",
            frameRange: { startFrameIndex: 0, endFrameIndex: 1 },
            notes: [
                "Review gesture labels manually before treating sequence events as intent corrections.",
            ],
        });
        expect(report.candidates[2]).toMatchObject({
            target: "anomaly_detector",
            notes: ["Review side assignment and invalid intent frames before automatic rejection."],
        });
    });

    it("uses the first side swap frame range from reliability warnings", () => {
        const summary = createSummary({
            sideSwapCount: { value: 1, status: "warn", severity: "warn" },
        });

        const report = analyzeMotionOptimizationCandidates({
            qaResult: createQaResult([createFixture("neutral-10s", "warn", summary)]),
            framesByFixtureId: {
                "neutral-10s": [createSideSwapFrame(4), createSideSwapFrame(5)],
            },
            generatedAtIso: GENERATED_AT_ISO,
        });

        expect(report.candidates[0]).toMatchObject({
            target: "anomaly_detector",
            frameRange: { startFrameIndex: 4, endFrameIndex: 4 },
        });
        expect(report.warnings).not.toContain("frame_range_not_found:neutral-10s:anomaly_detector");
    });

    it("skips pass and invalid fixtures with deterministic warnings", () => {
        const invalidFixture = createFixture("broken-fixture", "invalid_fixture");
        invalidFixture.errors.push("bad manifest", "missing log");

        const report = analyzeMotionOptimizationCandidates({
            qaResult: createQaResult([
                createFixture("neutral-10s", "pass", createSummary()),
                invalidFixture,
            ]),
            generatedAtIso: GENERATED_AT_ISO,
        });

        expect(report.candidates).toEqual([]);
        expect(report.warnings).toEqual([
            "fixture_skipped:neutral-10s:pass",
            "fixture_skipped:broken-fixture:invalid_fixture:bad manifest|missing log",
        ]);
    });

    it("collapses not_available-only warned fixtures into do_not_optimize", () => {
        const report = analyzeMotionOptimizationCandidates({
            qaResult: createQaResult([createFixture("neutral-10s", "warn", createSummary())]),
            generatedAtIso: GENERATED_AT_ISO,
        });

        expect(report.candidates).toHaveLength(1);
        expect(report.candidates[0]).toMatchObject({
            candidateId: "neutral-10s:do_not_optimize:0",
            target: "do_not_optimize",
            severity: "warn",
            evidence: [],
            requiresHumanLabel: false,
            notes: [
                "No actionable Phase 11 optimization target was identified from available metrics.",
            ],
        });
        expect(report.candidates[0]?.metricKeys).toContain("neutralJitter");
    });
});
