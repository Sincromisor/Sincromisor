import type { SincroTrackerWorkerStats } from "./SincroTrackerWorkerTypes";
import type { TrackerRuntimeCallbacks } from "./trackerRuntimeTypes";

export function publishTrackerRuntimeFallbackStats(
    callbacks: TrackerRuntimeCallbacks | undefined,
    workerStats: SincroTrackerWorkerStats,
    reason: string,
): void {
    callbacks?.onTrackerStats?.({
        mode: "fallback",
        status: "fallback",
        transferTimeMs: 0,
        workerRoundTripMs: 0,
        loadTimeMs: workerStats.loadTimeMs,
        droppedFrames: workerStats.droppedFrames,
        fallbackReason: reason,
    });
}
