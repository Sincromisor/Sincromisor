/**
 * tracker performance budget、dropped frame、degradation stage、ROI pause の metric を計算する。
 * tracker stats は optional debug slot なので、欠損時は replay 失敗ではなく not_available 用の 0 件入力として扱う。
 */
import { z } from "zod";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import { isRecord } from "./motionMetricFrameParsers";
import type { NumericMetricComputation } from "./motionMetricTypes";

// tracker metrics は performance budget / dropped frame / degradation / ROI pause の保存値だけを読む。
// pose や solver の品質計算、summary severity、baseline comparison はこの module では扱わない。
const trackerBudgetStatusSchema = z.enum(["ok", "warn", "over_budget"]);
const trackerDroppedFramesSchema = z.number().int().nonnegative();
const trackerDegradationStageSchema = z.enum([
    "full",
    "gesture-reduced-fps",
    "optional-pass-reduced-fps",
    "roi-hand-paused",
    "pose-reduced-fps",
    "face-only",
    "comfortable-idle",
]);
const trackerRoiPauseStateSchema = z.enum(["active", "hand-paused", "face-paused", "all-paused"]);

function trackerMetricsRecord(frame: SincroMotionDebugFrame): Record<string, unknown> | undefined {
    if (!isRecord(frame.metrics) || !isRecord(frame.metrics.tracker)) {
        return undefined;
    }
    return frame.metrics.tracker;
}

function parseTrackerBudgetStatus(
    frame: SincroMotionDebugFrame,
): z.infer<typeof trackerBudgetStatusSchema> | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.budget)) {
        return undefined;
    }
    const parsed = trackerBudgetStatusSchema.safeParse(tracker.budget.budgetStatus);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerDroppedFrames(frame: SincroMotionDebugFrame): number | undefined {
    const tracker = trackerMetricsRecord(frame);
    const parsed = trackerDroppedFramesSchema.safeParse(tracker?.droppedFrames);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerDegradationStage(
    frame: SincroMotionDebugFrame,
): z.infer<typeof trackerDegradationStageSchema> | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.degradationPolicy)) {
        return undefined;
    }
    const parsed = trackerDegradationStageSchema.safeParse(tracker.degradationPolicy.stage);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerLegacyDegradationState(frame: SincroMotionDebugFrame): string | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.budget) || !isRecord(tracker.budget.degradation)) {
        return undefined;
    }
    const parsed = z.string().safeParse(tracker.budget.degradation.state);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerDegradationRecovering(frame: SincroMotionDebugFrame): boolean | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.degradationPolicy)) {
        return undefined;
    }
    const parsed = z.boolean().safeParse(tracker.degradationPolicy.recovering);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerRoiPauseState(
    frame: SincroMotionDebugFrame,
): z.infer<typeof trackerRoiPauseStateSchema> | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.roi)) {
        return undefined;
    }
    const parsed = trackerRoiPauseStateSchema.safeParse(tracker.roi.pauseState);
    return parsed.success ? parsed.data : undefined;
}

export function calculateTrackerBudgetOverrunFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const budgetStatus = parseTrackerBudgetStatus(frame);
        if (budgetStatus === undefined) {
            continue;
        }
        sampleCount += 1;
        if (budgetStatus === "over_budget") {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "trackerBudgetOverrunFrameCount requires frame.metrics.tracker.budget.budgetStatus.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

export function calculateTrackerDroppedFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    let previousTrackerDroppedFrames: number | undefined;
    for (const frame of frames) {
        const timestampDroppedFrames = frame.timestamp.droppedPresentedFrames;
        const trackerDroppedFrames = parseTrackerDroppedFrames(frame);
        let trackerDroppedFrameDelta: number | undefined;
        if (trackerDroppedFrames !== undefined) {
            trackerDroppedFrameDelta =
                previousTrackerDroppedFrames === undefined
                    ? 0
                    : Math.max(0, trackerDroppedFrames - previousTrackerDroppedFrames);
            previousTrackerDroppedFrames = trackerDroppedFrames;
        }
        if (timestampDroppedFrames === undefined && trackerDroppedFrameDelta === undefined) {
            continue;
        }
        sampleCount += 1;
        count += Math.max(timestampDroppedFrames ?? 0, trackerDroppedFrameDelta ?? 0);
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "trackerDroppedFrameCount requires frame.timestamp.droppedPresentedFrames or frame.metrics.tracker.droppedFrames.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

export function calculateDegradationStageFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const policyStage = parseTrackerDegradationStage(frame);
        const legacyState = parseTrackerLegacyDegradationState(frame);
        if (policyStage === undefined && legacyState === undefined) {
            continue;
        }
        sampleCount += 1;
        if (
            (policyStage !== undefined && policyStage !== "full") ||
            (legacyState !== undefined && legacyState !== "full")
        ) {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "degradationStageFrameCount requires frame.metrics.tracker.degradationPolicy.stage or frame.metrics.tracker.budget.degradation.state.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

export function calculateDegradationRecoveryFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const recovering = parseTrackerDegradationRecovering(frame);
        if (recovering === undefined) {
            continue;
        }
        sampleCount += 1;
        if (recovering) {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "degradationRecoveryFrameCount requires frame.metrics.tracker.degradationPolicy.recovering.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

export function calculateRoiPausedFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const pauseState = parseTrackerRoiPauseState(frame);
        if (pauseState === undefined) {
            continue;
        }
        sampleCount += 1;
        if (pauseState !== "active") {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "roiPausedFrameCount requires frame.metrics.tracker.roi.pauseState.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}
