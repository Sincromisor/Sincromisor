import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityScore,
} from "../../../features/gaze/trackingRuntime/cameraQualityScore";
import {
    reset,
    SincroMotionObserveOnlyPipeline,
    updateFace,
    updateHand,
    updatePose,
} from "../sincroMotionObserveOnlyPipeline";

function createFace(overrides: Partial<SincroFaceMotionSnapshot> = {}): SincroFaceMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: 0.9,
        source: "full-frame",
        headPose: {
            yawDeg: 8,
            pitchDeg: 2,
            rollDeg: -1,
        },
        warnings: [],
        ...overrides,
    };
}

function createPose(overrides: Partial<SincroPoseMotionSnapshot> = {}): SincroPoseMotionSnapshot {
    return {
        ...cloneSincroPoseMotionSnapshot(DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT),
        trackingEnabled: true,
        detected: true,
        confidence: 0.8,
        lastUpdatedAtMs: 100,
        ...overrides,
    };
}

function createHand(overrides: Partial<SincroHandMotionSnapshot> = {}): SincroHandMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        leftHand: {
            ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand,
            detected: true,
            source: "roi",
            confidence: 0.7,
            features: {
                ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand.features,
                openness: "open",
            },
            warnings: ["roi_inconsistent"],
        },
        lastUpdatedAtMs: 120,
        ...overrides,
    };
}

function createFaceMatrixForYaw(yawRad: number): number[] {
    return [1, 0, 0, 0, 0, 1, 0, 0, -Math.tan(yawRad), 0, 1, 0, 0, 0, 0, 1];
}

function createCameraQuality(score: number): CameraQualityScore {
    return {
        schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
        overall: { score, status: score >= 0.8 ? "good" : score >= 0.45 ? "warn" : "bad" },
        components: {
            resolution: { score: 1, status: "good", reasonCodes: [] },
            cadence: { score: 1, status: "good", reasonCodes: [] },
            torsoInFrame: { score: 1, status: "good", reasonCodes: [] },
            handsInFrame: { score: 1, status: "good", reasonCodes: [] },
            borderRisk: { score: 1, status: "good", reasonCodes: [] },
            handSmallRisk: { score: 1, status: "good", reasonCodes: [] },
            motionBlurRisk: { score: 1, status: "good", reasonCodes: [] },
        },
        reasons: [],
        guideMessages: [],
        track: { width: 1280, height: 720, frameRate: 30, readyState: "live" },
        sample: {
            videoWidth: 1280,
            videoHeight: 720,
            poseDetected: true,
            poseConfidence: 0.9,
        },
    };
}

describe("SincroMotionObserveOnlyPipeline", () => {
    it("keeps face-only callbacks as not_computed until a pose frame exists", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        const result = pipeline.updateFace(createFace(), {
            mediaTimeMs: 100,
            receivedAtMs: 110,
            video: { width: 640, height: 480 },
        });

        expect(result.state.face.detected).toBe(true);
        expect(result.state.reliability).toBeUndefined();
        expect(result.summary.reliability.status).toBe("not_computed");
        expect(result.summary.reliability.reason).toBe("pose_not_available");
        expect(result.summary.hand.status).toBe("not_computed");
        expect(result.summary.composerDryRun.status).toBe("not_ready");
    });

    it("computes observe-only state from a pose-only legacy frame without throwing", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        const result = pipeline.updatePose(createPose(), {
            mediaTimeMs: 100,
            receivedAtMs: 112,
            video: { width: 640, height: 480 },
        });

        expect(result.summary.reliability.status).toBe("available");
        expect(result.summary.canonical.status).toBe("available");
        expect(result.summary.temporal.status).toBe("available");
        expect(result.summary.intent.status).toBe("available");
        expect(result.state.reliability?.joints.head.state).toBe("lost");
        expect(result.state.composerDryRun).toBeUndefined();
        expect(result.summary.composerDryRun.warnings).toEqual(["composer_dry_run_not_started"]);
    });

    it("passes bad camera quality into same-frame reliability components", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        const result = pipeline.updatePose(createPose(), {
            mediaTimeMs: 100,
            receivedAtMs: 112,
            video: { width: 640, height: 480 },
            cameraQuality: createCameraQuality(0),
        });

        expect(result.state.reliability?.camera).toMatchObject({
            cameraQualityScore: 0,
            cameraQualityStatus: "bad",
            reasonCodes: ["camera_quality_bad"],
        });
        expect(result.state.reliability?.joints.leftWrist.components.cameraQuality).toEqual({
            score: 0,
            reasonCodes: ["camera_quality_bad"],
        });
        expect(result.state.reliability?.parts.leftArm.components.cameraQuality).toEqual({
            score: 0,
            reasonCodes: ["camera_quality_bad"],
        });
    });

    it("stores latest hand snapshot as low-frequency summary without requiring pose", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        const result = updateHand(pipeline, createHand(), {
            mediaTimeMs: 120,
            receivedAtMs: 130,
            video: { width: 640, height: 480 },
        });

        expect(result.state.hand?.leftHand.detected).toBe(true);
        expect(result.summary.hand.status).toBe("available");
        expect(result.summary.hand.left).toMatchObject({
            detected: true,
            source: "roi",
            roiWarning: "roi_inconsistent",
            openness: "open",
            confidence: 0.7,
        });
        expect(result.summary.reliability.status).toBe("not_computed");
    });

    it("uses explicit mediaTimeMs for downstream timestamps and receivedAtMs for runtime update time", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        updateFace(pipeline, createFace(), {
            mediaTimeMs: 240,
            receivedAtMs: 9000,
            video: { width: 1280, height: 720 },
        });
        const result = updatePose(pipeline, createPose({ lastUpdatedAtMs: 241 }), {
            mediaTimeMs: 250,
            receivedAtMs: 9010,
            video: { width: 1280, height: 720 },
        });

        expect(result.state.reliability?.timestamp.mediaTimeMs).toBe(250);
        expect(result.state.canonical?.timestamp.mediaTimeMs).toBe(250);
        expect(result.state.temporal?.timestamp.mediaTimeMs).toBe(250);
        expect(result.state.intent?.timestamp.mediaTimeMs).toBe(250);
        expect(result.state.updatedAtMs).toBe(9010);
    });

    it("passes latest face matrix into live canonical head and temporal head", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        updateFace(
            pipeline,
            createFace({
                confidence: 0.9,
                headPose: {
                    yawDeg: 0,
                    pitchDeg: 0,
                    rollDeg: 0,
                    matrix: createFaceMatrixForYaw(0.24),
                },
            }),
            {
                mediaTimeMs: 240,
                receivedAtMs: 9000,
                video: { width: 1280, height: 720 },
            },
        );
        const result = updatePose(pipeline, createPose({ lastUpdatedAtMs: 241 }), {
            mediaTimeMs: 250,
            receivedAtMs: 9010,
            video: { width: 1280, height: 720 },
        });

        expect(result.state.canonical?.head?.yawRad).toBeCloseTo(0.24);
        expect(result.state.canonical?.head?.source).toBe("face");
        expect(result.state.temporal?.head?.yawRad).toBeCloseTo(0.24);
        expect(result.state.temporal?.head?.source).toBe("canonical");
    });

    it("returns invalid_input without advancing downstream estimators when timing is absent", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();

        const result = pipeline.updatePose(createPose(), {
            video: { width: 640, height: 480 },
        });

        expect(result.state.pose.detected).toBe(true);
        expect(result.state.reliability).toBeUndefined();
        expect(result.summary.reliability.status).toBe("invalid_input");
        expect(result.summary.reliability.reason).toBe("media_time_missing");
    });

    it("resets stateful temporal and intent memory at lifecycle boundaries", () => {
        const pipeline = new SincroMotionObserveOnlyPipeline();
        pipeline.updatePose(createPose({ lastUpdatedAtMs: 100 }), {
            mediaTimeMs: 100,
            receivedAtMs: 100,
            video: { width: 640, height: 480 },
        });

        reset(pipeline);

        const summary = pipeline.getSummary();
        expect(summary.temporal.status).toBe("not_computed");
        expect(summary.intent.status).toBe("not_computed");
        expect(summary.hand.status).toBe("not_computed");
        expect(summary.composerDryRun.status).toBe("not_ready");
        expect(pipeline.getState().temporal).toBeUndefined();
        expect(pipeline.getState().intent).toBeUndefined();
        expect(pipeline.getState().hand).toBeUndefined();
    });
});
