import { describe, expect, it } from "vitest";

import {
    createTrackerPerformanceBudgetReport,
    TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
} from "../trackerRuntimePerformanceBudget";

describe("createTrackerPerformanceBudgetReport", () => {
    it("reports ok when worker and pose inference stay inside budget", () => {
        const report = createTrackerPerformanceBudgetReport({
            targetInferenceFps: 20,
            targetPoseInferenceFps: 10,
            clockSource: "request-video-frame-callback",
            transferTimeMs: 4,
            workerRoundTripMs: 35,
            workerTimeMs: 28,
            poseInferenceTimeMs: 80,
            droppedFrames: 0,
        });

        expect(report).toMatchObject({
            schemaVersion: TRACKER_PERFORMANCE_BUDGET_SCHEMA_VERSION,
            budgetStatus: "ok",
            target: {
                faceTargetFps: 20,
                poseTargetFps: 10,
                frameBudgetMs: 50,
                poseBudgetMs: 100,
            },
            observed: {
                clockSource: "request-video-frame-callback",
                transferTimeMs: 4,
                workerRoundTripMs: 35,
                workerTimeMs: 28,
                poseInferenceTimeMs: 80,
                droppedFrames: 0,
            },
            degradation: {
                state: "full",
            },
            reasonCodes: [],
        });
    });

    it("reports warn reason codes at the worker and pose warn thresholds", () => {
        const report = createTrackerPerformanceBudgetReport({
            targetInferenceFps: 20,
            targetPoseInferenceFps: 10,
            workerRoundTripMs: 46,
            poseInferenceTimeMs: 91,
            droppedFrames: 0,
        });

        expect(report.budgetStatus).toBe("warn");
        expect(report.reasonCodes).toEqual(["worker_round_trip_warn", "pose_inference_warn"]);
    });

    it("reports over_budget reason codes when thresholds are exceeded", () => {
        const report = createTrackerPerformanceBudgetReport({
            targetInferenceFps: 20,
            targetPoseInferenceFps: 10,
            workerRoundTripMs: 63,
            poseInferenceTimeMs: 126,
            droppedFrames: 2,
        });

        expect(report.budgetStatus).toBe("over_budget");
        expect(report.reasonCodes).toEqual([
            "worker_round_trip_over_budget",
            "pose_inference_over_budget",
            "worker_pending_frame_dropped",
        ]);
    });

    it("records main-thread-low-fps degradation and effective fps clamp", () => {
        const report = createTrackerPerformanceBudgetReport({
            targetInferenceFps: 8,
            targetPoseInferenceFps: 4,
            mainThreadDetectTimeMs: 22,
            effectiveFaceFps: 8,
            effectivePoseFps: 4,
            degradationState: "main-thread-low-fps",
            degradationReason: "main_thread_fallback",
            fallbackReason: "worker_or_createImageBitmap_unavailable",
        });

        expect(report.degradation).toMatchObject({
            state: "main-thread-low-fps",
            reason: "main_thread_fallback",
        });
        expect(report.observed).toMatchObject({
            mainThreadDetectTimeMs: 22,
            effectiveFaceFps: 8,
            effectivePoseFps: 4,
        });
        expect(report.reasonCodes).toEqual(["main_thread_fallback", "worker_unavailable"]);
    });

    it("records face-only degradation reason codes", () => {
        const report = createTrackerPerformanceBudgetReport({
            targetInferenceFps: 15,
            targetPoseInferenceFps: 12,
            poseInferenceTimeMs: 120,
            degradationState: "face-only",
            degradationReason: "pose_detection_failed_repeatedly",
            degradationSinceMediaTimeMs: 240,
        });

        expect(report.degradation).toEqual({
            state: "face-only",
            reason: "pose_detection_failed_repeatedly",
            sinceMediaTimeMs: 240,
        });
        expect(report.reasonCodes).toContain("pose_detection_failed_repeatedly");
        expect(report.reasonCodes).toContain("pose_inference_over_budget");
    });

    it("maps worker failure fallback reasons without changing fallbackReason strings", () => {
        const report = createTrackerPerformanceBudgetReport({
            targetInferenceFps: 15,
            targetPoseInferenceFps: 12,
            fallbackReason: "DataCloneError: failed to transfer frame",
        });

        expect(report.reasonCodes).toEqual(["main_thread_fallback", "worker_failed"]);
    });

    it("drops non-finite optional observations and accepts unknown optional input fields", () => {
        const input = {
            targetInferenceFps: 15,
            targetPoseInferenceFps: 12,
            transferTimeMs: Number.NaN,
            workerRoundTripMs: Number.POSITIVE_INFINITY,
            workerTimeMs: undefined,
            droppedFrames: -1,
            unknownOptionalField: "ignored",
        };

        const report = createTrackerPerformanceBudgetReport(input);

        expect(report.observed).toEqual({
            droppedFrames: 0,
        });
        expect(report.reasonCodes).toEqual([]);
    });
});
