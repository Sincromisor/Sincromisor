import { describe, expect, it } from "vitest";
import type { SincroMotionDebugFrame } from "../motionDebugLogSchema";
import {
    calculateTrackerPerformanceDurationSummary,
    parseTrackerPerformanceDurationSamples,
} from "../motionTrackerPerformanceSamples";

function frame(frameIndex: number, tracker?: Record<string, unknown>): SincroMotionDebugFrame {
    return {
        frameIndex,
        timestamp: { mediaTimeMs: frameIndex * 16 },
        video: { width: 1280, height: 720 },
        ...(tracker === undefined ? {} : { metrics: { tracker } }),
    };
}

describe("motion tracker performance samples", () => {
    it("keeps legacy omissions and selects total duration strictly by tracker mode", () => {
        const result = parseTrackerPerformanceDurationSamples([
            frame(0),
            frame(1, {
                mode: "worker",
                workerTimeMs: 12,
                mainThreadDetectTimeMs: 999,
                gestureInferenceTimeMs: 3,
            }),
            frame(2, {
                mode: "main-thread",
                workerTimeMs: 888,
                mainThreadDetectTimeMs: 15,
            }),
        ]);

        expect(result.warnings).toEqual([]);
        expect(result.samples).toEqual([
            { frameIndex: 0 },
            { frameIndex: 1, gestureInferenceTimeMs: 3, totalTrackerTimeMs: 12 },
            { frameIndex: 2, totalTrackerTimeMs: 15 },
        ]);
    });

    it("warns per invalid field while retaining valid fields in the same frame", () => {
        const result = parseTrackerPerformanceDurationSamples([
            frame(7, {
                mode: "worker",
                gestureInferenceTimeMs: -1,
                workerTimeMs: 9,
            }),
            frame(8, {
                mode: "main-thread",
                gestureInferenceTimeMs: Number.POSITIVE_INFINITY,
                mainThreadDetectTimeMs: Number.NaN,
            }),
        ]);

        expect(result.samples).toEqual([
            { frameIndex: 7, totalTrackerTimeMs: 9 },
            { frameIndex: 8 },
        ]);
        expect(result.warnings).toEqual([
            {
                code: "invalid_tracker_duration",
                frameIndex: 7,
                fieldPath: "metrics.tracker.gestureInferenceTimeMs",
            },
            {
                code: "invalid_tracker_duration",
                frameIndex: 8,
                fieldPath: "metrics.tracker.gestureInferenceTimeMs",
            },
            {
                code: "invalid_tracker_duration",
                frameIndex: 8,
                fieldPath: "metrics.tracker.mainThreadDetectTimeMs",
            },
        ]);
    });

    it("calculates nearest-rank p95 for zero, one, and multiple samples", () => {
        expect(calculateTrackerPerformanceDurationSummary([])).toEqual({
            gestureInferenceDurationMsP95: null,
            totalTrackerDurationMsP95: null,
        });
        expect(
            calculateTrackerPerformanceDurationSummary([
                { frameIndex: 0, gestureInferenceTimeMs: 2, totalTrackerTimeMs: 5 },
            ]),
        ).toEqual({
            gestureInferenceDurationMsP95: 2,
            totalTrackerDurationMsP95: 5,
        });

        const samples = Array.from({ length: 20 }, (_, index) => ({
            frameIndex: index,
            ...(index % 2 === 0 ? { gestureInferenceTimeMs: index } : {}),
            totalTrackerTimeMs: index + 1,
        }));
        expect(calculateTrackerPerformanceDurationSummary(samples)).toEqual({
            gestureInferenceDurationMsP95: 18,
            totalTrackerDurationMsP95: 19,
        });
    });
});
