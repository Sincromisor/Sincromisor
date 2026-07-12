import { describe, expect, it, vi } from "vitest";
import {
    createMainThreadTrackerFrameMeasurement,
    createWorkerGestureDurationFields,
    measureWorkerTrackerFrame,
} from "../trackerRuntimeDurationMeasurement";

function deterministicClock(...values: number[]): () => number {
    const now = vi.fn(() => {
        const value = values.shift();
        if (value === undefined) throw new Error("Unexpected clock read");
        return value;
    });
    return now;
}

describe("tracker runtime duration measurement", () => {
    it("measures main-thread total from callback entry through optional pass completion on one clock", () => {
        const now = deterministicClock(10, 29);
        const measurement = createMainThreadTrackerFrameMeasurement(now);
        const optionalPass = vi.fn(() => ({ detected: true, inferenceTimeMs: 6 }));
        const gesture = optionalPass();

        expect(measurement.finish(gesture.inferenceTimeMs)).toEqual({
            mainThreadDetectTimeMs: 19,
            gestureInferenceTimeMs: 6,
        });
        expect(optionalPass).toHaveBeenCalledOnce();
        expect(now).toHaveBeenCalledTimes(2);
    });

    it("omits main-thread Gesture timing when skipped but retains it for a lost executed result", () => {
        const skipped = createMainThreadTrackerFrameMeasurement(deterministicClock(1, 4));
        expect(skipped.finish()).toEqual({ mainThreadDetectTimeMs: 3 });

        const lost = createMainThreadTrackerFrameMeasurement(deterministicClock(10, 18));
        const lostExecutedResult = { detected: false, inferenceTimeMs: 5 };
        expect(lost.finish(lostExecutedResult.inferenceTimeMs)).toEqual({
            mainThreadDetectTimeMs: 8,
            gestureInferenceTimeMs: 5,
        });
    });

    it("serializes Worker Gesture timing for detected and lost results but not skipped passes", () => {
        expect(createWorkerGestureDurationFields()).toEqual({});
        expect(createWorkerGestureDurationFields({ inferenceTimeMs: 2 })).toEqual({
            gestureInferenceTimeMs: 2,
        });
        const lostResult = { detected: false, inferenceTimeMs: 7 };
        expect(createWorkerGestureDurationFields(lostResult)).toEqual({
            gestureInferenceTimeMs: 7,
        });
    });

    it("starts Worker total before initialization on both initialized and uninitialized paths", async () => {
        const initializedEvents: string[] = [];
        const initialized = await measureWorkerTrackerFrame({
            now: deterministicClock(100, 106),
            initialize: async () => {
                initializedEvents.push("initialize-noop");
            },
            detect: () => {
                initializedEvents.push("detect");
                return "result";
            },
        });
        expect(initialized).toEqual({ result: "result", workerTimeMs: 6 });
        expect(initializedEvents).toEqual(["initialize-noop", "detect"]);

        const uninitializedEvents: string[] = [];
        const now = deterministicClock(200, 225);
        const uninitialized = await measureWorkerTrackerFrame({
            now,
            initialize: async () => {
                uninitializedEvents.push("initialize-with-model-load");
            },
            detect: () => {
                uninitializedEvents.push("detect");
                return "result";
            },
        });
        expect(uninitialized).toEqual({ result: "result", workerTimeMs: 25 });
        expect(uninitializedEvents).toEqual(["initialize-with-model-load", "detect"]);
        expect(now).toHaveBeenCalledTimes(2);
    });
});
