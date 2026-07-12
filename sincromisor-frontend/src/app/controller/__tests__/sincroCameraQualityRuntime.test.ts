import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import type { TrackerVideoFrameTiming } from "../../../features/gaze/trackingRuntime/trackerRuntimeTypes";
import { SincroCameraQualityRuntime } from "../sincroCameraQualityRuntime";

function createPoint(cameraX: number, cameraY: number): SincroPoseTargetPointSnapshot {
    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        tracked: true,
        quality: "strong",
        confidence: 0.9,
        visibility: 0.9,
        presence: 0.9,
        hasFiniteCoordinates: true,
        usableForIk: true,
        ikWeight: 1,
        stale: false,
        staleReason: undefined,
        cameraX,
        cameraY,
        world: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT.world },
    };
}

function createPose(overrides: Partial<SincroPoseMotionSnapshot> = {}): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.86,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.32,
            shoulderWidth: 0.24,
            hipCenterTracked: true,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.9,
            targets: {
                shoulder: createPoint(0.38, 0.32),
                elbow: createPoint(0.34, 0.54),
                wrist: createPoint(0.3, 0.64),
            },
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.9,
            targets: {
                shoulder: createPoint(0.62, 0.32),
                elbow: createPoint(0.66, 0.54),
                wrist: createPoint(0.7, 0.64),
            },
        },
        lowerBodyTargets: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.lowerBodyTargets,
            leftHip: createPoint(0.42, 0.66),
            rightHip: createPoint(0.58, 0.66),
        },
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: 120,
        ...overrides,
    });
}

function createTiming(mediaTimeMs: number): TrackerVideoFrameTiming {
    return {
        source: "request-video-frame-callback",
        receivedAtPerformanceMs: mediaTimeMs + 1000,
        mediaTimeMs,
        videoCurrentTimeMs: mediaTimeMs,
        presentationTimeMs: mediaTimeMs + 1,
        expectedDisplayTimeMs: mediaTimeMs + 16,
        presentedFrames: mediaTimeMs / 33,
        droppedPresentedFrames: 0,
    };
}

describe("SincroCameraQualityRuntime", () => {
    it("creates a scrubbed production camera score from a pose frame", () => {
        const runtime = new SincroCameraQualityRuntime();

        const score = runtime.updatePoseQuality({
            pose: createPose(),
            timing: createTiming(99),
            video: { width: 1280, height: 720 },
            trackSettings: {
                width: 1280,
                height: 720,
                frameRate: 30,
                facingMode: "user",
                deviceId: "raw-device",
                groupId: "raw-group",
            },
            trackReadyState: "live",
        });

        expect(score?.track).toEqual({
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: "user",
            readyState: "live",
        });
        expect(score?.sample).toMatchObject({
            mediaTimeMs: 99,
            videoWidth: 1280,
            videoHeight: 720,
            poseDetected: true,
            poseConfidence: 0.86,
        });
        expect(JSON.stringify(score)).not.toContain("raw-device");
        expect(JSON.stringify(score)).not.toContain("raw-group");
    });

    it("does not create a score for source none equivalent stop snapshots", () => {
        const runtime = new SincroCameraQualityRuntime();
        runtime.updatePoseQuality({
            pose: createPose(),
            timing: createTiming(99),
            video: { width: 1280, height: 720 },
            trackSettings: { width: 1280, height: 720, frameRate: 30 },
            trackReadyState: "live",
        });

        const score = runtime.updatePoseQuality({
            pose: createPose({ trackingEnabled: false, detected: false, confidence: 0 }),
            timing: createTiming(132),
            video: { width: 1280, height: 720 },
            trackSettings: { width: 1280, height: 720, frameRate: 30 },
            trackReadyState: "live",
        });

        expect(score).toBeUndefined();
        expect(runtime.getCameraQuality()).toBeUndefined();
    });

    it("resets latest score and bounded histories at lifecycle boundaries", () => {
        const runtime = new SincroCameraQualityRuntime();
        for (let index = 0; index < 30; index += 1) {
            runtime.updatePoseQuality({
                pose: createPose(),
                timing: createTiming(index * 33),
                video: { width: 1280, height: 720 },
                trackSettings: { width: 1280, height: 720, frameRate: 30 },
                trackReadyState: "live",
            });
        }
        expect(runtime.getCameraQuality()?.components.cadence.status).toBe("good");

        runtime.reset();
        expect(runtime.getCameraQuality()).toBeUndefined();

        const score = runtime.updatePoseQuality({
            pose: createPose(),
            timing: createTiming(999),
            video: { width: 1280, height: 720 },
            trackSettings: { width: 1280, height: 720, frameRate: 30 },
            trackReadyState: "live",
        });
        expect(score?.components.cadence.status).toBe("unknown");
    });
});
