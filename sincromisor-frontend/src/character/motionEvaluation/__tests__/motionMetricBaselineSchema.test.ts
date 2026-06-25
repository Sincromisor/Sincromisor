import { describe, expect, it } from "vitest";
import {
    type MotionMetricBaseline,
    parseMotionMetricBaseline,
} from "../motionMetricBaselineSchema";
import {
    calculateMotionMetricSummary,
    MOTION_METRIC_KEYS,
    type MotionMetricConfig,
} from "../motionMetrics";

const CONFIG: MotionMetricConfig = {
    fixtureId: "neutral-10s",
    generatedAtIso: "2026-06-23T12:00:00.000Z",
    thresholdVersion: "initial-v1",
};

function createBaseline(): MotionMetricBaseline {
    return {
        schemaVersion: "sincro.motion-metric-baseline.v1",
        fixtureId: "neutral-10s",
        logId: "unit-test-log",
        thresholdVersion: "initial-v1",
        metricSummary: calculateMotionMetricSummary([], CONFIG),
    };
}

describe("parseMotionMetricBaseline", () => {
    it("accepts the fixed v1 baseline shape", () => {
        const result = parseMotionMetricBaseline(createBaseline());

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.baseline.fixtureId).toBe("neutral-10s");
        expect(Object.keys(result.baseline.metricSummary.metrics).sort()).toEqual(
            [...MOTION_METRIC_KEYS].sort(),
        );
        expect(
            result.baseline.metricSummary.metrics.temporalPredictedArmFrameCount.value,
        ).toBeNull();
    });

    it("reports unknown fixture ids separately", () => {
        const baseline = {
            ...createBaseline(),
            fixtureId: "unknown-fixture",
        };

        expect(parseMotionMetricBaseline(baseline)).toMatchObject({
            ok: false,
            errors: [{ code: "unknown_fixture_id", path: ["fixtureId"] }],
        });
    });

    it("reports invalid metric summaries", () => {
        const baseline = createBaseline();
        baseline.metricSummary = {
            ...baseline.metricSummary,
            severity: "pass",
        };

        const result = parseMotionMetricBaseline(baseline);
        expect(result.ok).toBe(false);
        if (result.ok) {
            return;
        }
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_metric_summary",
                    path: ["metricSummary", "severity"],
                }),
            ]),
        );
    });
});
