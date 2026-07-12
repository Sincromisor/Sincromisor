/** Measure a Worker frame from detect entry through initialization and all inference passes. */
export async function measureWorkerTrackerFrame<Result>(input: {
    initialize: () => Promise<void>;
    detect: () => Result;
    now?: () => number;
}): Promise<{ result: Result; workerTimeMs: number }> {
    const now = input.now ?? (() => performance.now());
    const startedAtMs = now();
    await input.initialize();
    const result = input.detect();
    return { result, workerTimeMs: now() - startedAtMs };
}

/** Keep main-thread total and optional Gesture duration on one injected monotonic clock. */
export function createMainThreadTrackerFrameMeasurement(
    now: () => number = () => performance.now(),
) {
    const startedAtMs = now();
    return {
        finish(gestureInferenceTimeMs?: number) {
            return {
                mainThreadDetectTimeMs: now() - startedAtMs,
                ...(gestureInferenceTimeMs === undefined ? {} : { gestureInferenceTimeMs }),
            };
        },
    };
}

/** Serialize Gesture timing only when its optional pass actually produced a result. */
export function createWorkerGestureDurationFields(gesture?: { inferenceTimeMs: number }): {
    gestureInferenceTimeMs?: number;
} {
    return gesture === undefined ? {} : { gestureInferenceTimeMs: gesture.inferenceTimeMs };
}
