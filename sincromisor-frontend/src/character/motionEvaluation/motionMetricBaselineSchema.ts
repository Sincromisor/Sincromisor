/**
 * Motion QA baseline JSON の parser 境界。
 * 未知 metric key や値域外 threshold は reject し、旧 baseline の missing metric は comparison / summary 側で not_available として補完する。
 */
import { z } from "zod";
import {
    DEFAULT_MOTION_METRIC_THRESHOLDS,
    MOTION_METRIC_KEYS,
    MOTION_P0_FIXTURE_IDS,
    type MotionMetricKey,
    type MotionMetricResult,
    type MotionMetricSeverity,
    type MotionMetricSummary,
    type MotionMetricThreshold,
    type MotionP0FixtureId,
} from "./motionMetrics";

export type MotionMetricBaseline = {
    schemaVersion: "sincro.motion-metric-baseline.v1";
    fixtureId: MotionP0FixtureId;
    logId: string;
    thresholdVersion: "initial-v1";
    metricSummary: MotionMetricSummary;
};

export type MotionMetricBaselineParseError = {
    code: "invalid_baseline" | "unknown_fixture_id" | "invalid_metric_summary";
    message: string;
    path: string[];
};

export type MotionMetricBaselineParseResult =
    | { ok: true; baseline: MotionMetricBaseline }
    | { ok: false; errors: MotionMetricBaselineParseError[] };

const motionP0FixtureIdSchema = z.enum(MOTION_P0_FIXTURE_IDS);
const motionMetricKeySchema = z.enum(MOTION_METRIC_KEYS);
const motionMetricSeveritySchema = z.enum(["pass", "warn", "fail"]);
const motionMetricStatusSchema = z.enum(["pass", "warn", "fail", "not_available"]);
const motionMetricDirectionSchema = z.enum(["lower_is_better", "higher_is_better"]);
const motionMetricUnitSchema = z.enum(["px", "deg", "count", "ratio", "ms"]);

const motionMetricThresholdSchema: z.ZodType<MotionMetricThreshold> = z
    .object({
        pass: z.number().finite(),
        warn: z.number().finite(),
        fail: z.number().finite(),
    })
    .strict();

const motionMetricResultSchema: z.ZodType<MotionMetricResult> = z
    .object({
        key: motionMetricKeySchema,
        value: z.number().finite().nullable(),
        unit: motionMetricUnitSchema,
        status: motionMetricStatusSchema,
        severity: motionMetricSeveritySchema,
        direction: motionMetricDirectionSchema,
        threshold: motionMetricThresholdSchema,
        sampleCount: z.number().int().nonnegative(),
        unavailableReason: z.string().optional(),
    })
    .strict()
    .superRefine((metric, context) => {
        if (metric.status === "not_available" && metric.value !== null) {
            context.addIssue({
                code: "custom",
                message: "not_available metric value must be null.",
                path: ["value"],
            });
        }
        if (metric.status !== "not_available" && metric.value === null) {
            context.addIssue({
                code: "custom",
                message: "available metric value must be a number.",
                path: ["value"],
            });
        }
    });

const motionMetricSummarySchema: z.ZodType<MotionMetricSummary> = z
    .object({
        schemaVersion: z.literal("sincro.motion-metrics.v1"),
        fixtureId: motionP0FixtureIdSchema.optional(),
        generatedAtIso: z.string(),
        frameCount: z.number().int().nonnegative(),
        durationMs: z.number().finite().nonnegative(),
        severity: motionMetricSeveritySchema,
        metrics: z.record(motionMetricKeySchema, motionMetricResultSchema),
    })
    .strict()
    .superRefine((summary, context) => {
        for (const key of MOTION_METRIC_KEYS) {
            const metric = summary.metrics[key];
            if (metric === undefined) {
                context.addIssue({
                    code: "custom",
                    message: `metric ${key} is missing.`,
                    path: ["metrics", key],
                });
                continue;
            }
            if (metric.key !== key) {
                context.addIssue({
                    code: "custom",
                    message: `metric ${key} has mismatched key.`,
                    path: ["metrics", key, "key"],
                });
            }
        }
        if (summaryContainsNotAvailable(summary) && summary.severity === "pass") {
            context.addIssue({
                code: "custom",
                message: "summary severity must not be pass when a metric is not_available.",
                path: ["severity"],
            });
        }
        if (summary.severity !== maxMetricSeverity(summary)) {
            context.addIssue({
                code: "custom",
                message: "summary severity must equal the maximum metric severity.",
                path: ["severity"],
            });
        }
    });

const motionMetricBaselineSchema: z.ZodType<MotionMetricBaseline> = z
    .object({
        schemaVersion: z.literal("sincro.motion-metric-baseline.v1"),
        fixtureId: motionP0FixtureIdSchema,
        logId: z.string().min(1),
        thresholdVersion: z.literal("initial-v1"),
        metricSummary: motionMetricSummarySchema,
    })
    .strict()
    .superRefine((baseline, context) => {
        if (baseline.metricSummary.fixtureId !== baseline.fixtureId) {
            context.addIssue({
                code: "custom",
                message: "baseline fixtureId must match metricSummary.fixtureId.",
                path: ["metricSummary", "fixtureId"],
            });
        }
    });

const baselineFixtureProbeSchema = z
    .object({
        fixtureId: z.unknown().optional(),
    })
    .passthrough();

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summaryContainsNotAvailable(summary: MotionMetricSummary): boolean {
    return MOTION_METRIC_KEYS.some((key) => summary.metrics[key].status === "not_available");
}

function severityRank(severity: MotionMetricSeverity): number {
    if (severity === "pass") {
        return 0;
    }
    if (severity === "warn") {
        return 1;
    }
    return 2;
}

function maxMetricSeverity(summary: MotionMetricSummary): MotionMetricSeverity {
    let severity: MotionMetricSeverity = "pass";
    for (const key of MOTION_METRIC_KEYS) {
        const metric = summary.metrics[key];
        if (severityRank(metric.severity) > severityRank(severity)) {
            severity = metric.severity;
        }
    }
    return severity;
}

function zodPathToStrings(path: readonly PropertyKey[]): string[] {
    return path.map((segment) => String(segment));
}

function classifyIssue(path: readonly PropertyKey[]): MotionMetricBaselineParseError["code"] {
    if (path[0] === "metricSummary") {
        return "invalid_metric_summary";
    }
    return "invalid_baseline";
}

function isKnownFixtureId(value: unknown): value is MotionP0FixtureId {
    return MOTION_P0_FIXTURE_IDS.some((fixtureId) => fixtureId === value);
}

export function parseMotionMetricBaseline(value: unknown): MotionMetricBaselineParseResult {
    const fixtureProbe = baselineFixtureProbeSchema.safeParse(value);
    if (
        fixtureProbe.success &&
        fixtureProbe.data.fixtureId !== undefined &&
        !isKnownFixtureId(fixtureProbe.data.fixtureId)
    ) {
        return {
            ok: false,
            errors: [
                {
                    code: "unknown_fixture_id",
                    message: "Motion metric baseline fixtureId is not supported.",
                    path: ["fixtureId"],
                },
            ],
        };
    }

    const parsed = motionMetricBaselineSchema.safeParse(normalizeMissingMetricKeys(value));
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.map((issue) => ({
                code: classifyIssue(issue.path),
                message: issue.message,
                path: zodPathToStrings(issue.path),
            })),
        };
    }

    return { ok: true, baseline: parsed.data };
}

function normalizeMissingMetricKeys(value: unknown): unknown {
    if (!isRecord(value) || !isRecord(value.metricSummary)) {
        return value;
    }
    const metricSummary = value.metricSummary;
    if (!isRecord(metricSummary.metrics)) {
        return value;
    }
    const metrics: Record<string, unknown> = { ...metricSummary.metrics };
    let filledMissingMetric = false;
    for (const key of MOTION_METRIC_KEYS) {
        if (metrics[key] === undefined) {
            metrics[key] = createMissingMetricResult(key);
            filledMissingMetric = true;
        }
    }
    if (!filledMissingMetric) {
        return value;
    }
    const normalizedSummary = {
        ...metricSummary,
        metrics,
        severity: maxMetricSeverityFromUnknownMetrics(metrics),
    };
    return {
        ...value,
        metricSummary: normalizedSummary,
    };
}

function createMissingMetricResult(key: MotionMetricKey): MotionMetricResult {
    const definition = metricDefinition(key);
    return {
        key,
        value: null,
        unit: definition.unit,
        status: "not_available",
        severity: "warn",
        direction: definition.direction,
        threshold: DEFAULT_MOTION_METRIC_THRESHOLDS[key],
        sampleCount: 0,
        unavailableReason: "Metric key was missing from an older baseline.",
    };
}

function metricDefinition(key: MotionMetricKey): Pick<MotionMetricResult, "unit" | "direction"> {
    switch (key) {
        case "recoveryJumpAngleDeg":
        case "temporalMaxRecoveryJumpDegEquivalent":
            return { unit: "deg", direction: "lower_is_better" };
        case "trackingLossDurationMs":
        case "addedLatencyMs":
        case "temporalLostArmDurationMs":
            return { unit: "ms", direction: "lower_is_better" };
        case "neutralJitter":
        case "reachClampOccupancy":
        case "temporalNeutralWristJitter":
        case "solverReachClampOccupancy":
        case "solverExcessReachRatioP95":
            return { unit: "ratio", direction: "lower_is_better" };
        case "elbowFlipCount":
        case "angularVelocitySpikeCount":
        case "sideSwapCount":
        case "temporalPredictedArmFrameCount":
        case "temporalRecoveringArmFrameCount":
        case "solverElbowFlipRejectCount":
        case "solverPoleUncertainFrameCount":
        case "finalPoseAngularVelocityClampCount":
        case "finalPoseOwnedBoneConflictCount":
        case "gestureFlickerCount":
        case "semanticFallbackFrameCount":
        case "intentCooldownSuppressionCount":
        case "intentInvalidFrameCount":
        case "trackerBudgetOverrunFrameCount":
        case "trackerDroppedFrameCount":
        case "degradationStageFrameCount":
        case "degradationRecoveryFrameCount":
        case "roiPausedFrameCount":
            return { unit: "count", direction: "lower_is_better" };
    }
}

function maxMetricSeverityFromUnknownMetrics(
    metrics: Record<string, unknown>,
): MotionMetricSeverity {
    let severity: MotionMetricSeverity = "pass";
    for (const key of MOTION_METRIC_KEYS) {
        const metric = metrics[key];
        if (!isRecord(metric)) {
            continue;
        }
        const metricSeverity = metricSeverityFromUnknown(metric.severity, metric.status);
        if (severityRank(metricSeverity) > severityRank(severity)) {
            severity = metricSeverity;
        }
    }
    return severity;
}

function metricSeverityFromUnknown(severity: unknown, status: unknown): MotionMetricSeverity {
    if (severity === "fail" || status === "fail") {
        return "fail";
    }
    if (severity === "warn" || status === "warn" || status === "not_available") {
        return "warn";
    }
    return "pass";
}
