/**
 * motion-debug frame の tracker duration を baseline 計算向けに取り出す layer parser。
 *
 * envelope parser が optional metrics を unknown のまま保つため、旧 log の欠損は受理しつつ、存在する
 * duration だけを field 単位で検証する。mode と異なる total field は transport 情報として無視し、
 * Worker round-trip のような tracker 外時間を total に混ぜない。
 */
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";

export type TrackerPerformanceDurationFieldPath =
    | "metrics.tracker.gestureInferenceTimeMs"
    | "metrics.tracker.workerTimeMs"
    | "metrics.tracker.mainThreadDetectTimeMs";

export type TrackerPerformanceSampleWarning = {
    code: "invalid_tracker_duration";
    frameIndex: number;
    fieldPath: TrackerPerformanceDurationFieldPath;
};

export type TrackerPerformanceDurationSample = {
    frameIndex: number;
    gestureInferenceTimeMs?: number;
    totalTrackerTimeMs?: number;
};

export type TrackerPerformanceDurationSummary = {
    gestureInferenceDurationMsP95: number | null;
    totalTrackerDurationMsP95: number | null;
};

type UnknownRecord = Record<string, unknown>;

/** Parse duration fields without turning one corrupt telemetry value into a whole-log failure. */
export function parseTrackerPerformanceDurationSamples(frames: SincroMotionDebugFrame[]): {
    samples: TrackerPerformanceDurationSample[];
    warnings: TrackerPerformanceSampleWarning[];
} {
    const warnings: TrackerPerformanceSampleWarning[] = [];
    const samples = frames.map((frame) => {
        const tracker = readRecord(readRecord(frame.metrics)?.tracker);
        const gestureInferenceTimeMs = readDuration(
            tracker,
            "gestureInferenceTimeMs",
            frame.frameIndex,
            "metrics.tracker.gestureInferenceTimeMs",
            warnings,
        );
        const totalTrackerTimeMs =
            tracker?.mode === "worker"
                ? readDuration(
                      tracker,
                      "workerTimeMs",
                      frame.frameIndex,
                      "metrics.tracker.workerTimeMs",
                      warnings,
                  )
                : tracker?.mode === "main-thread"
                  ? readDuration(
                        tracker,
                        "mainThreadDetectTimeMs",
                        frame.frameIndex,
                        "metrics.tracker.mainThreadDetectTimeMs",
                        warnings,
                    )
                  : undefined;
        return {
            frameIndex: frame.frameIndex,
            ...(gestureInferenceTimeMs === undefined ? {} : { gestureInferenceTimeMs }),
            ...(totalTrackerTimeMs === undefined ? {} : { totalTrackerTimeMs }),
        };
    });
    return { samples, warnings };
}

/** Calculate reproducible nearest-rank p95 values from finite parsed samples only. */
export function calculateTrackerPerformanceDurationSummary(
    samples: TrackerPerformanceDurationSample[],
): TrackerPerformanceDurationSummary {
    return {
        gestureInferenceDurationMsP95: nearestRankP95(
            samples.flatMap((sample) =>
                sample.gestureInferenceTimeMs === undefined ? [] : [sample.gestureInferenceTimeMs],
            ),
        ),
        totalTrackerDurationMsP95: nearestRankP95(
            samples.flatMap((sample) =>
                sample.totalTrackerTimeMs === undefined ? [] : [sample.totalTrackerTimeMs],
            ),
        ),
    };
}

function readRecord(value: unknown): UnknownRecord | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? (value as UnknownRecord)
        : undefined;
}

function readDuration(
    tracker: UnknownRecord | undefined,
    field: string,
    frameIndex: number,
    fieldPath: TrackerPerformanceDurationFieldPath,
    warnings: TrackerPerformanceSampleWarning[],
): number | undefined {
    const value = tracker?.[field];
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        warnings.push({ code: "invalid_tracker_duration", frameIndex, fieldPath });
        return undefined;
    }
    return value;
}

function nearestRankP95(values: number[]): number | null {
    if (values.length === 0) {
        return null;
    }
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[Math.ceil(0.95 * sorted.length) - 1] ?? null;
}
