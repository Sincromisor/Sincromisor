import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type {
    SincroTrackerRoiReasonCode,
    SincroTrackerRoiStats,
    SincroTrackerWorkerStats,
} from "./sincroTrackerWorkerTypes";
import type {
    TrackerRuntimeDegradationPolicyCadence,
    TrackerRuntimeDegradationPolicyController,
    TrackerRuntimeDegradationPolicyDecision,
} from "./trackerRuntimeDegradationPolicy";
import { createTrackerPerformanceBudgetReport } from "./trackerRuntimePerformanceBudget";
import type { TrackerRuntimePerformanceProfile } from "./trackerRuntimePerformanceProfile";
import type { TrackerRuntimeRoiBudgetController } from "./trackerRuntimeRoiBudget";
import type { TrackerRuntimeMutableState, TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

export type TrackerRuntimeRoiFrameInput = {
    handRan: boolean;
    faceRoiRan: boolean;
    handResult?: { snapshot: SincroHandMotionSnapshot; inferenceTimeMs: number };
    faceRoiSnapshot?: SincroFaceMotionSnapshot;
    skippedReasons: SincroTrackerRoiReasonCode[];
};

export function recordTrackerRuntimeRoiFrame(input: {
    roiBudget: TrackerRuntimeRoiBudgetController;
    targetPoseInferenceFps: number;
    frame: TrackerRuntimeRoiFrameInput;
}): SincroTrackerRoiStats {
    return input.roiBudget.recordFrame({
        handRan: input.frame.handRan,
        faceRoiRan: input.frame.faceRoiRan,
        handInferenceTimeMs: input.frame.handResult?.inferenceTimeMs,
        faceRoiInferenceTimeMs: input.frame.faceRoiRan
            ? input.frame.faceRoiSnapshot?.inferenceTimeMs
            : undefined,
        handUsedFullFrameFallback:
            input.frame.handResult?.snapshot.leftHand.source === "full-frame-fallback" ||
            input.frame.handResult?.snapshot.rightHand.source === "full-frame-fallback",
        faceUsedFullFrameFallback: input.frame.faceRoiSnapshot?.source === "full-frame-fallback",
        skippedReasons: input.frame.skippedReasons,
        targetPoseInferenceFps: input.targetPoseInferenceFps,
    });
}

export function createMainThreadTrackerRuntimeStats(input: {
    workerStats: SincroTrackerWorkerStats;
    state: TrackerRuntimeMutableState;
    timing: TrackerVideoFrameTiming;
    mainThreadDetectTimeMs: number;
    poseInferenceTimeMs?: number;
    poseDetected?: boolean;
    roiStats: SincroTrackerRoiStats;
    applyBudget: (input: TrackerRuntimeBudgetInput) => SincroTrackerWorkerStats;
}): SincroTrackerWorkerStats {
    return input.applyBudget({
        stats: {
            mode: "main-thread",
            status: input.state.mainThreadFallbackReason === undefined ? "running" : "fallback",
            transferTimeMs: 0,
            workerRoundTripMs: 0,
            mainThreadDetectTimeMs: input.mainThreadDetectTimeMs,
            loadTimeMs: input.workerStats.loadTimeMs,
            droppedFrames: input.workerStats.droppedFrames,
            fallbackReason: input.state.mainThreadFallbackReason,
            effectiveFaceFps: input.state.targetInferenceFps,
            effectivePoseFps: input.state.targetPoseInferenceFps,
            effectiveHandFps: input.state.handTrackingEnabled
                ? input.state.targetHandInferenceFps
                : undefined,
            effectiveFaceRoiFps: input.state.faceRoiTrackingEnabled
                ? input.state.targetFaceRoiInferenceFps
                : undefined,
            roi: input.roiStats,
        },
        timing: input.timing,
        poseInferenceTimeMs: input.poseInferenceTimeMs,
        poseDetected: input.poseDetected,
        roiStats: input.roiStats,
    });
}

export type TrackerRuntimeBudgetInput = {
    stats: SincroTrackerWorkerStats;
    timing: TrackerVideoFrameTiming;
    poseInferenceTimeMs?: number;
    poseDetected?: boolean;
    roiStats: SincroTrackerRoiStats;
};

export function applyTrackerRuntimeStatsBudget(input: {
    budgetInput: TrackerRuntimeBudgetInput;
    state: TrackerRuntimeMutableState;
    performanceProfile: TrackerRuntimePerformanceProfile;
    degradationPolicy: TrackerRuntimeDegradationPolicyController;
    applyDegradationDecision: (
        decision: TrackerRuntimeDegradationPolicyDecision,
        timing: TrackerVideoFrameTiming,
    ) => TrackerRuntimeDegradationPolicyCadence;
    getState: () => TrackerRuntimeMutableState;
    getRoiStats: () => SincroTrackerRoiStats;
}): SincroTrackerWorkerStats {
    const { stats, timing, poseInferenceTimeMs, poseDetected, roiStats } = input.budgetInput;
    const fallbackReason = stats.fallbackReason ?? input.state.mainThreadFallbackReason;
    const budget = createTrackerPerformanceBudgetReport({
        targetInferenceFps: input.state.targetInferenceFps,
        targetPoseInferenceFps: input.state.targetPoseInferenceFps,
        clockSource: timing.source,
        transferTimeMs: stats.transferTimeMs,
        workerRoundTripMs: stats.workerRoundTripMs,
        workerTimeMs: stats.workerTimeMs,
        mainThreadDetectTimeMs: stats.mainThreadDetectTimeMs,
        poseInferenceTimeMs,
        droppedFrames: stats.droppedFrames,
        effectiveFaceFps: stats.effectiveFaceFps ?? input.state.targetInferenceFps,
        effectivePoseFps: stats.effectivePoseFps ?? input.state.targetPoseInferenceFps,
        degradationState: input.state.degradationState,
        degradationReason: input.state.degradationReason,
        degradationSinceMediaTimeMs: input.state.degradationSinceMediaTimeMs,
        fallbackReason,
        reasonCodes: roiStats.reasonCodes,
    });
    const decision = input.degradationPolicy.update({
        mediaTimeMs: timing.mediaTimeMs,
        profile: input.performanceProfile,
        budgetStatus: budget.budgetStatus,
        budgetReasonCodes: budget.reasonCodes,
        poseInferenceTimeMs,
        poseDetected,
        roi: {
            pauseState: roiStats.pauseState,
            consecutiveOverBudgetFrames: roiStats.consecutiveOverBudgetFrames,
            reasonCodes: roiStats.reasonCodes,
        },
        mainThreadFallbackActive: input.state.mainThreadFallbackReason !== undefined,
        ignorePerformanceFallback: input.state.ignorePosePerformanceFallback,
    });
    const appliedCadence = input.applyDegradationDecision(decision, timing);
    const stateAfterDecision = input.getState();
    const updatedRoiStats = input.getRoiStats();
    return {
        ...stats,
        effectiveFaceFps: appliedCadence.faceFps,
        effectivePoseFps: appliedCadence.poseFps,
        effectiveHandFps: appliedCadence.handFps,
        effectiveFaceRoiFps: appliedCadence.faceRoiFps,
        roi: updatedRoiStats,
        degradationPolicy: {
            ...decision.snapshot,
            effectiveCadence: appliedCadence,
        },
        budget: createTrackerPerformanceBudgetReport({
            targetInferenceFps: stateAfterDecision.targetInferenceFps,
            targetPoseInferenceFps: stateAfterDecision.targetPoseInferenceFps,
            clockSource: timing.source,
            transferTimeMs: stats.transferTimeMs,
            workerRoundTripMs: stats.workerRoundTripMs,
            workerTimeMs: stats.workerTimeMs,
            mainThreadDetectTimeMs: stats.mainThreadDetectTimeMs,
            poseInferenceTimeMs,
            droppedFrames: stats.droppedFrames,
            effectiveFaceFps: appliedCadence.faceFps,
            effectivePoseFps: appliedCadence.poseFps,
            degradationState: stateAfterDecision.degradationState,
            degradationReason: stateAfterDecision.degradationReason,
            degradationSinceMediaTimeMs: stateAfterDecision.degradationSinceMediaTimeMs,
            fallbackReason,
            reasonCodes: decision.reasonCodes,
        }),
    };
}
