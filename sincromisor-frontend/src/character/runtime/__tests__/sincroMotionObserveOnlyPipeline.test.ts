import { describe, expect, it } from "vitest";

import {
    type SincroGestureMotionSnapshot,
    toGestureIntentObservation,
} from "../../../features/gaze/gestureTracking/sincroGestureMotionSnapshot";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import { SincroMotionObserveOnlyPipeline } from "../sincroMotionObserveOnlyPipeline";

describe("SincroMotionObserveOnlyPipeline gesture input", () => {
    it("stores normalized gesture observation while keeping ReliabilityMap.gesture as placeholder", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();
        const gesture = createGestureSnapshot(120);

        const gestureResult = pipeline.updateGesture(gesture, {
            mediaTimeMs: 120,
            receivedAtMs: 120,
            gesture: toGestureIntentObservation(gesture),
        });
        const poseResult = pipeline.updatePose(createPoseSnapshot(160), {
            mediaTimeMs: 160,
            receivedAtMs: 160,
            video: { width: 640, height: 480 },
        });

        expect(gestureResult.summary.gesture).toMatchObject({
            status: "available",
            inferenceFps: 3,
            left: {
                label: "Open_Palm",
                confidence: 0.91,
                source: "gesture-recognizer",
            },
        });
        expect(poseResult.state.gesture).toEqual({
            left: { label: "Open_Palm", confidence: 0.91 },
        });
        expect(poseResult.state.reliability?.gesture).toMatchObject({
            state: "lost",
            finalWeight: 0,
            source: "neutral",
            warnings: ["no_observation"],
        });
    });
});

function createGestureSnapshot(timestampMs: number): SincroGestureMotionSnapshot {
    return {
        trackingEnabled: true,
        source: "gesture-recognizer",
        left: {
            label: "Open_Palm",
            confidence: 0.91,
            handedness: "left",
            source: "gesture-recognizer",
            warnings: [],
        },
        warnings: [],
        inferenceTimeMs: 4,
        inferenceFps: 3,
        lastUpdatedAtMs: timestampMs,
    };
}

function createPoseSnapshot(timestampMs: number) {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.8,
        lastUpdatedAtMs: timestampMs,
    });
}
