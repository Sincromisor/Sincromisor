/**
 * fallback 中でも Debug Console / motion-debug が読める Worker stats 互換 snapshot を publish する。
 * 実推論が無い状態を full success と誤読させないよう、budget reason と ROI stats は degraded / fallback として保持する。
 */
import type { SincroTrackerRoiStats, SincroTrackerWorkerStats } from "./sincroTrackerWorkerTypes";
import { createTrackerPerformanceBudgetReport } from "./trackerRuntimePerformanceBudget";
import type { TrackerRuntimeCallbacks } from "./trackerRuntimeTypes";

export function publishTrackerRuntimeFallbackStats(
    callbacks: TrackerRuntimeCallbacks | undefined,
    workerStats: SincroTrackerWorkerStats,
    reason: string,
    targetInferenceFps: number,
    targetPoseInferenceFps: number,
    targetHandInferenceFps: number,
    targetGestureInferenceFps: number,
    targetFaceRoiInferenceFps: number,
    roiStats: SincroTrackerRoiStats,
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
        effectiveGestureFps: targetGestureInferenceFps,
        effectiveFaceRoiFps: targetFaceRoiInferenceFps,
        roi: roiStats,
        budget: createTrackerPerformanceBudgetReport({
            targetInferenceFps,
            targetPoseInferenceFps,
            droppedFrames: workerStats.droppedFrames,
            effectiveFaceFps: targetInferenceFps,
            effectivePoseFps: targetPoseInferenceFps,
            degradationState: "main-thread-low-fps",
            degradationReason: "main_thread_fallback",
            fallbackReason: reason,
            reasonCodes: roiStats.reasonCodes,
        }),
    });
}
