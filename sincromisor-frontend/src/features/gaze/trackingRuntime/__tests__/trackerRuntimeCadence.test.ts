import { describe, expect, it } from "vitest";

import {
    shouldRunTrackerFaceRoiInference,
    shouldRunTrackerHandInference,
    shouldRunTrackerInference,
    shouldRunTrackerPoseInference,
} from "../trackerRuntimeCadence";

describe("trackerRuntimeCadence", () => {
    it("keeps existing full-frame Face cadence independent from Pose cadence", () => {
        expect(
            shouldRunTrackerInference({
                lastInferenceAtMs: 0,
                targetInferenceFps: 15,
                nowMs: 67,
            }),
        ).toBe(true);
        expect(
            shouldRunTrackerPoseInference({
                poseTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                lastPoseInferenceAtMs: 0,
                targetPoseInferenceFps: 4,
                nowMs: 200,
            }),
        ).toBe(false);
    });

    it("runs Hand ROI at its own cadence when Pose is fresh", () => {
        expect(
            shouldRunTrackerHandInference({
                handTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                lastHandInferenceAtMs: 0,
                targetHandInferenceFps: 2,
                hasFreshPoseSnapshot: true,
                nowMs: 499,
            }),
        ).toBe(false);
        expect(
            shouldRunTrackerHandInference({
                handTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                lastHandInferenceAtMs: 0,
                targetHandInferenceFps: 2,
                hasFreshPoseSnapshot: true,
                nowMs: 500,
            }),
        ).toBe(true);
    });

    it("runs Face ROI at the default 6fps cadence and skips stale Pose", () => {
        expect(
            shouldRunTrackerFaceRoiInference({
                faceRoiTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                lastFaceRoiInferenceAtMs: 0,
                targetFaceRoiInferenceFps: 6,
                hasFreshPoseSnapshot: true,
                nowMs: 166,
            }),
        ).toBe(false);
        expect(
            shouldRunTrackerFaceRoiInference({
                faceRoiTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                lastFaceRoiInferenceAtMs: 0,
                targetFaceRoiInferenceFps: 6,
                hasFreshPoseSnapshot: true,
                nowMs: 167,
            }),
        ).toBe(true);
        expect(
            shouldRunTrackerFaceRoiInference({
                faceRoiTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                lastFaceRoiInferenceAtMs: -1,
                targetFaceRoiInferenceFps: 6,
                hasFreshPoseSnapshot: false,
                nowMs: 500,
            }),
        ).toBe(false);
    });

    it("skips Hand and Face ROI while their pause states are active", () => {
        expect(
            shouldRunTrackerHandInference({
                handTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                handRoiPaused: true,
                lastHandInferenceAtMs: -1,
                targetHandInferenceFps: 4,
                hasFreshPoseSnapshot: true,
                nowMs: 0,
            }),
        ).toBe(false);
        expect(
            shouldRunTrackerFaceRoiInference({
                faceRoiTrackingEnabled: true,
                poseDegradedToFaceOnly: false,
                faceRoiPaused: true,
                lastFaceRoiInferenceAtMs: -1,
                targetFaceRoiInferenceFps: 6,
                hasFreshPoseSnapshot: true,
                nowMs: 0,
            }),
        ).toBe(false);
    });
});
