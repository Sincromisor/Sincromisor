import { describe, expect, it } from "vitest";

import { clampTrackerRuntimeTargetsForMainThreadFallback } from "../trackerRuntimeFpsPolicy";
import { TrackerRuntimeRoiBudgetController } from "../trackerRuntimeRoiBudget";

describe("TrackerRuntimeRoiBudgetController", () => {
    it("advances ROI pause state after 5 consecutive over-budget ROI frames", () => {
        const controller = new TrackerRuntimeRoiBudgetController();

        for (let frame = 0; frame < 5; frame += 1) {
            controller.recordFrame({
                handRan: true,
                faceRoiRan: true,
                handInferenceTimeMs: 30,
                faceRoiInferenceTimeMs: 30,
                targetPoseInferenceFps: 12,
            });
        }

        expect(controller.getStats()).toMatchObject({
            pauseState: "hand-paused",
            reasonCodes: ["roi_inference_over_budget"],
        });
    });

    it("recovers one ROI pause state after 30 budget-safe ROI frames", () => {
        const controller = new TrackerRuntimeRoiBudgetController();
        for (let frame = 0; frame < 10; frame += 1) {
            controller.recordFrame({
                handRan: true,
                faceRoiRan: true,
                handInferenceTimeMs: 60,
                faceRoiInferenceTimeMs: 0,
                targetPoseInferenceFps: 12,
            });
        }
        expect(controller.getPauseState()).toBe("face-paused");

        for (let frame = 0; frame < 30; frame += 1) {
            controller.recordFrame({
                handRan: false,
                faceRoiRan: true,
                faceRoiInferenceTimeMs: 1,
                targetPoseInferenceFps: 12,
            });
        }

        expect(controller.getPauseState()).toBe("hand-paused");
    });

    it("records ROI fallback and skipped reason stats cumulatively", () => {
        const controller = new TrackerRuntimeRoiBudgetController();

        const stats = controller.recordFrame({
            handRan: false,
            faceRoiRan: true,
            faceRoiInferenceTimeMs: 2,
            faceUsedFullFrameFallback: true,
            skippedReasons: ["pose_stale_for_roi", "hand_roi_skipped"],
            targetPoseInferenceFps: 12,
        });

        expect(stats).toMatchObject({
            fallbackCount: 1,
            skippedFrames: 1,
            reasonCodes: ["pose_stale_for_roi", "hand_roi_skipped", "roi_fallback_full_frame"],
        });
    });

    it("merges policy pause and budget reasons without duplicate skip stats", () => {
        const controller = new TrackerRuntimeRoiBudgetController();
        controller.setPolicyPauseState("hand-paused");

        const stats = controller.recordFrame({
            handRan: false,
            faceRoiRan: true,
            faceRoiInferenceTimeMs: 1,
            skippedReasons: ["hand_roi_paused", "hand_roi_paused"],
            targetPoseInferenceFps: 12,
        });

        expect(stats).toMatchObject({
            pauseState: "hand-paused",
            fallbackCount: 0,
            skippedFrames: 0,
            reasonCodes: ["hand_roi_paused"],
        });
    });
});

describe("clampTrackerRuntimeTargetsForMainThreadFallback", () => {
    it("clamps main-thread fallback fps without changing the full-frame limits", () => {
        expect(
            clampTrackerRuntimeTargetsForMainThreadFallback({
                targetInferenceFps: 15,
                targetPoseInferenceFps: 12,
                targetHandInferenceFps: 8,
                targetGestureInferenceFps: 6,
                targetFaceRoiInferenceFps: 6,
            }),
        ).toEqual({
            targetInferenceFps: 8,
            targetPoseInferenceFps: 4,
            targetHandInferenceFps: 2,
            targetGestureInferenceFps: 2,
            targetFaceRoiInferenceFps: 3,
        });
    });
});
