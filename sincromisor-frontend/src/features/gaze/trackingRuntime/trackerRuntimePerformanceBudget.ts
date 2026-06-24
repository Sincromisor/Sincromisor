export type TrackerRuntimeDegradationState =
    | "full"
    | "main-thread-low-fps"
    | "pose-reduced-fps"
    | "face-only"
    | "fallback";

export type TrackerPerformanceReasonCode =
    | "worker_round_trip_warn"
    | "worker_round_trip_over_budget"
    | "worker_transfer_warn"
    | "worker_pending_frame_dropped"
    | "pose_inference_warn"
    | "pose_inference_over_budget"
    | "pose_detection_failed_repeatedly"
    | "worker_unavailable"
    | "worker_failed"
    | "main_thread_fallback";

export type TrackerPerformanceBudgetStatus = "ok" | "warn" | "over_budget";

export type TrackerPerformanceBudgetReport = {
    schemaVersion: "sincro.tracker-performance-budget.v1";
    target: {
        faceTargetFps: number;
        poseTargetFps: number;
        frameBudgetMs: number;
        poseBudgetMs: number;
    };
    observed: {
        clockSource?: string;
        transferTimeMs?: number;
        workerRoundTripMs?: number;
        workerTimeMs?: number;
        mainThreadDetectTimeMs?: number;
        poseInferenceTimeMs?: number;
        droppedFrames: number;
        effectiveFaceFps?: number;
        effectivePoseFps?: number;
    };
    budgetStatus: TrackerPerformanceBudgetStatus;
    degradation: {
        state: TrackerRuntimeDegradationState;
        reason?: TrackerPerformanceReasonCode;
        sinceMediaTimeMs?: number;
    };
    reasonCodes: TrackerPerformanceReasonCode[];
};

export type TrackerPerformanceBudgetReportInput = {
    targetInferenceFps: number;
    targetPoseInferenceFps: number;
    clockSource?: string;
    transferTimeMs?: number;
    workerRoundTripMs?: number;
    workerTimeMs?: number;
    mainThreadDetectTimeMs?: number;
    poseInferenceTimeMs?: number;
    droppedFrames?: number;
    effectiveFaceFps?: number;
    effectivePoseFps?: number;
    degradationState?: TrackerRuntimeDegradationState;
    degradationReason?: TrackerPerformanceReasonCode;
    degradationSinceMediaTimeMs?: number;
    fallbackReason?: string;
    reasonCodes?: TrackerPerformanceReasonCode[];
};

export const TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION =
    "sincro.tracker-performance-budget.v1" as const;

const WORKER_ROUND_TRIP_WARN_RATIO = 0.9;
const WORKER_ROUND_TRIP_OVER_BUDGET_RATIO = 1.25;
const POSE_INFERENCE_WARN_RATIO = 0.9;
const POSE_INFERENCE_OVER_BUDGET_RATIO = 1.25;

export function createTrackerPerformanceBudgetReport(
    input: TrackerPerformanceBudgetReportInput,
): TrackerPerformanceBudgetReport {
    const faceTargetFps = positiveFiniteOrOne(input.targetInferenceFps);
    const poseTargetFps = positiveFiniteOrOne(input.targetPoseInferenceFps);
    const frameBudgetMs = 1000 / faceTargetFps;
    const poseBudgetMs = 1000 / poseTargetFps;
    const reasonCodes = new Set<TrackerPerformanceReasonCode>(input.reasonCodes ?? []);
    let budgetStatus: TrackerPerformanceBudgetStatus = "ok";

    const workerRoundTripMs = finiteOrUndefined(input.workerRoundTripMs);
    if (workerRoundTripMs !== undefined) {
        if (workerRoundTripMs > frameBudgetMs * WORKER_ROUND_TRIP_OVER_BUDGET_RATIO) {
            budgetStatus = "over_budget";
            reasonCodes.add("worker_round_trip_over_budget");
        } else if (workerRoundTripMs > frameBudgetMs * WORKER_ROUND_TRIP_WARN_RATIO) {
            budgetStatus = maxBudgetStatus(budgetStatus, "warn");
            reasonCodes.add("worker_round_trip_warn");
        }
    }

    const poseInferenceTimeMs = finiteOrUndefined(input.poseInferenceTimeMs);
    if (poseInferenceTimeMs !== undefined) {
        if (poseInferenceTimeMs > poseBudgetMs * POSE_INFERENCE_OVER_BUDGET_RATIO) {
            budgetStatus = "over_budget";
            reasonCodes.add("pose_inference_over_budget");
        } else if (poseInferenceTimeMs > poseBudgetMs * POSE_INFERENCE_WARN_RATIO) {
            budgetStatus = maxBudgetStatus(budgetStatus, "warn");
            reasonCodes.add("pose_inference_warn");
        }
    }

    const droppedFrames = nonNegativeFiniteOrZero(input.droppedFrames);
    if (droppedFrames > 0) {
        reasonCodes.add("worker_pending_frame_dropped");
    }
    addFallbackReasonCodes(reasonCodes, input.fallbackReason);
    if (input.degradationReason !== undefined) {
        reasonCodes.add(input.degradationReason);
    }

    return {
        schemaVersion: TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
        target: {
            faceTargetFps,
            poseTargetFps,
            frameBudgetMs,
            poseBudgetMs,
        },
        observed: {
            clockSource: input.clockSource,
            transferTimeMs: finiteOrUndefined(input.transferTimeMs),
            workerRoundTripMs,
            workerTimeMs: finiteOrUndefined(input.workerTimeMs),
            mainThreadDetectTimeMs: finiteOrUndefined(input.mainThreadDetectTimeMs),
            poseInferenceTimeMs,
            droppedFrames,
            effectiveFaceFps: finiteOrUndefined(input.effectiveFaceFps),
            effectivePoseFps: finiteOrUndefined(input.effectivePoseFps),
        },
        budgetStatus,
        degradation: {
            state: input.degradationState ?? "full",
            reason: input.degradationReason,
            sinceMediaTimeMs: finiteOrUndefined(input.degradationSinceMediaTimeMs),
        },
        reasonCodes: [...reasonCodes],
    };
}

function addFallbackReasonCodes(
    reasonCodes: Set<TrackerPerformanceReasonCode>,
    fallbackReason: string | undefined,
): void {
    if (fallbackReason === undefined || fallbackReason.length === 0) {
        return;
    }
    reasonCodes.add("main_thread_fallback");
    if (
        fallbackReason === "worker_or_createImageBitmap_unavailable" ||
        fallbackReason.includes("not supported") ||
        fallbackReason.includes("unavailable")
    ) {
        reasonCodes.add("worker_unavailable");
        return;
    }
    reasonCodes.add("worker_failed");
}

function maxBudgetStatus(
    current: TrackerPerformanceBudgetStatus,
    next: TrackerPerformanceBudgetStatus,
): TrackerPerformanceBudgetStatus {
    if (current === "over_budget" || next === "over_budget") {
        return "over_budget";
    }
    if (current === "warn" || next === "warn") {
        return "warn";
    }
    return "ok";
}

function positiveFiniteOrOne(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 1;
}

function finiteOrUndefined(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function nonNegativeFiniteOrZero(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;
}
