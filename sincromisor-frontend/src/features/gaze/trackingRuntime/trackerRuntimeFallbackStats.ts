import type { SincroTrackerWorkerStats } from "./sincroTrackerWorkerTypes";
import { createTrackerPerformanceBudgetReport } from "./trackerRuntimePerformanceBudget";
import type { TrackerRuntimeCallbacks } from "./trackerRuntimeTypes";

export function publishTrackerRuntimeFallbackStats(
    callbacks: TrackerRuntimeCallbacks | undefined,
    workerStats: SincroTrackerWorkerStats,
    reason: string,
    targetInferenceFps: number,
    targetPoseInferenceFps: number,
    targetHandInferenceFps: number,
): void {
    callbacks?.onTrackerStats?.({
        mode: "main-thread",
        status: "fallback",
        transferTimeMs: 0,
        workerRoundTripMs: 0,
        loadTimeMs: workerStats.loadTimeMs,
        droppedFrames: workerStats.droppedFrames,
        fallbackReason: reason,
        effectiveFaceFps: targetInferenceFps,
        effectivePoseFps: targetPoseInferenceFps,
        effectiveHandFps: targetHandInferenceFps,
        budget: createTrackerPerformanceBudgetReport({
            targetInferenceFps,
            targetPoseInferenceFps,
            droppedFrames: workerStats.droppedFrames,
            effectiveFaceFps: targetInferenceFps,
            effectivePoseFps: targetPoseInferenceFps,
            degradationState: "main-thread-low-fps",
            degradationReason: "main_thread_fallback",
            fallbackReason: reason,
        }),
    });
}
