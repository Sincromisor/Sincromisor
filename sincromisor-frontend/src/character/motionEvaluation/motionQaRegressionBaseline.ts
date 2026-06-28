import { type MotionMetricBaseline, parseMotionMetricBaseline } from "./motionMetricBaselineSchema";
import { MOTION_METRIC_KEYS } from "./motionMetrics";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function baselineMissingMetricWarnings(baseline: unknown): string[] {
    if (!isRecord(baseline) || !isRecord(baseline.metricSummary)) {
        return [];
    }
    const metricSummary = baseline.metricSummary;
    const metrics = metricSummary.metrics;
    if (!isRecord(metrics)) {
        return [];
    }
    return MOTION_METRIC_KEYS.filter((key) => metrics[key] === undefined).map(
        (key) => `Baseline metric ${key} is missing and was treated as not_available.`,
    );
}

export function parseRegressionBaseline(
    rawBaseline: unknown,
):
    | { ok: true; baseline: MotionMetricBaseline; warnings: string[] }
    | { ok: false; errors: string[] } {
    const parsed = parseMotionMetricBaseline(rawBaseline);
    if (!parsed.ok) {
        return {
            ok: false,
            errors: parsed.errors.map((error) => `Baseline ${error.code}: ${error.message}`),
        };
    }
    return {
        ok: true,
        baseline: parsed.baseline,
        warnings: baselineMissingMetricWarnings(rawBaseline),
    };
}
