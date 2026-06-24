import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../../poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../poseTracking/sincroPoseMotionSnapshotClone";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityPoseSample,
    createCameraQualityScore,
} from "../cameraQualityScore";
import type { TrackerVideoFrameTiming } from "../trackerRuntimeTypes";

function createPoint(
    cameraX: number,
    cameraY: number,
    options: { tracked?: boolean } = {},
): SincroPoseTargetPointSnapshot {
    const tracked = options.tracked ?? true;
    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        tracked,
        quality: tracked ? "strong" : "lost",
        confidence: tracked ? 0.9 : 0,
        visibility: tracked ? 0.9 : 0,
        presence: tracked ? 0.9 : 0,
        hasFiniteCoordinates: tracked,
        usableForIk: tracked,
        ikWeight: tracked ? 1 : 0,
        stale: !tracked,
        staleReason: tracked ? undefined : "not_tracked",
        cameraX,
        cameraY,
        world: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT.world },
    };
}

function createPose(
    overrides: {
        leftShoulder?: SincroPoseTargetPointSnapshot;
        rightShoulder?: SincroPoseTargetPointSnapshot;
        leftHip?: SincroPoseTargetPointSnapshot;
        rightHip?: SincroPoseTargetPointSnapshot;
        leftElbow?: SincroPoseTargetPointSnapshot;
        leftWrist?: SincroPoseTargetPointSnapshot;
        rightElbow?: SincroPoseTargetPointSnapshot;
        rightWrist?: SincroPoseTargetPointSnapshot;
        shoulderWidth?: number;
        confidence?: number;
        detected?: boolean;
    } = {},
): SincroPoseMotionSnapshot {
    const leftShoulder = overrides.leftShoulder ?? createPoint(0.38, 0.32);
    const rightShoulder = overrides.rightShoulder ?? createPoint(0.62, 0.32);
    const leftHip = overrides.leftHip ?? createPoint(0.42, 0.66);
    const rightHip = overrides.rightHip ?? createPoint(0.58, 0.66);
    const leftElbow = overrides.leftElbow ?? createPoint(0.34, 0.54);
    const leftWrist = overrides.leftWrist ?? createPoint(0.3, 0.64);
    const rightElbow = overrides.rightElbow ?? createPoint(0.66, 0.54);
    const rightWrist = overrides.rightWrist ?? createPoint(0.7, 0.64);
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        detected: overrides.detected ?? true,
        confidence: overrides.confidence ?? 0.82,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.32,
            shoulderWidth: overrides.shoulderWidth ?? 0.24,
            hipCenterTracked: true,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.9,
            targets: {
                shoulder: leftShoulder,
                elbow: leftElbow,
                wrist: leftWrist,
            },
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: true,
            confidence: 0.9,
            targets: {
                shoulder: rightShoulder,
                elbow: rightElbow,
                wrist: rightWrist,
            },
        },
        lowerBodyTargets: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.lowerBodyTargets,
            leftHip,
            rightHip,
        },
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: 120,
    });
}

function createTiming(
    mediaTimeMs: number,
    options: { presentedFrames?: number; droppedPresentedFrames?: number } = {},
): TrackerVideoFrameTiming {
    return {
        source: "request-video-frame-callback",
        receivedAtPerformanceMs: mediaTimeMs + 5000,
        mediaTimeMs,
        videoCurrentTimeMs: mediaTimeMs,
        presentationTimeMs: mediaTimeMs + 1,
        expectedDisplayTimeMs: mediaTimeMs + 16,
        presentedFrames: options.presentedFrames,
        droppedPresentedFrames: options.droppedPresentedFrames ?? 0,
    };
}

function createTimingHistory(
    frameCount: number,
    intervalMs: number,
    droppedPresentedFrames = 0,
): TrackerVideoFrameTiming[] {
    return Array.from({ length: frameCount }, (_, index) =>
        createTiming(index * intervalMs, {
            presentedFrames: index,
            droppedPresentedFrames,
        }),
    );
}

function createScore(
    options: {
        trackSettings?: MediaTrackSettings;
        trackReadyState?: MediaStreamTrackState;
        videoWidth?: number;
        videoHeight?: number;
        pose?: SincroPoseMotionSnapshot;
        timingHistory?: TrackerVideoFrameTiming[];
        poseSamples?: CameraQualityPoseSample[];
    } = {},
) {
    const timingHistory = options.timingHistory ?? createTimingHistory(30, 33);
    return createCameraQualityScore({
        source: "camera",
        trackSettings: options.trackSettings ?? {
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: "user",
            deviceId: "raw-device",
            groupId: "raw-group",
        },
        trackReadyState: options.trackReadyState ?? "live",
        videoWidth: options.videoWidth ?? 1280,
        videoHeight: options.videoHeight ?? 720,
        pose: options.pose ?? createPose(),
        timing: timingHistory[timingHistory.length - 1],
        timingHistory,
        poseSamples:
            options.poseSamples ??
            Array.from({ length: 10 }, () => ({
                poseDetected: true,
                poseConfidence: 0.82,
            })),
    });
}

describe("createCameraQualityScore", () => {
    it("returns schema v1, scrubbed track settings, and resolution statuses", () => {
        const good = createScore();
        const warn = createScore({ trackSettings: { width: 640, height: 480, frameRate: 30 } });
        const bad = createScore({ trackSettings: { width: 320, height: 240, frameRate: 30 } });

        expect(good.schemaVersion).toBe(CAMERA_QUALITY_SCHEMA_VERSION);
        expect(good.components.resolution).toMatchObject({ status: "good", score: 1 });
        expect(warn.components.resolution).toMatchObject({
            status: "warn",
            score: 0.55,
            reasonCodes: ["low_resolution"],
        });
        expect(bad.components.resolution).toMatchObject({
            status: "bad",
            score: 0,
            reasonCodes: ["low_resolution"],
        });
        expect(good.track).toEqual({
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: "user",
            readyState: "live",
        });
        expect(JSON.stringify(good)).not.toContain("raw-device");
        expect(JSON.stringify(good)).not.toContain("raw-group");
    });

    it("falls back to fixture video size when track size is unavailable", () => {
        const score = createCameraQualityScore({
            source: "fixture",
            trackSettings: {},
            trackReadyState: "live",
            videoWidth: 1280,
            videoHeight: 720,
            pose: createPose(),
            timing: createTiming(120),
            timingHistory: createTimingHistory(30, 33),
            poseSamples: [],
        });

        expect(score.components.resolution.status).toBe("good");
    });

    it("scores cadence as unknown, good, and bad from video frame timing", () => {
        const unknown = createScore({ timingHistory: createTimingHistory(4, 33) });
        const good = createScore({ timingHistory: createTimingHistory(30, 33) });
        const bad = createScore({ timingHistory: createTimingHistory(30, 140, 1) });

        expect(unknown.components.cadence).toMatchObject({
            status: "unknown",
            score: 0,
            reasonCodes: [],
        });
        expect(good.components.cadence.status).toBe("good");
        expect(bad.components.cadence).toMatchObject({
            status: "bad",
            reasonCodes: ["low_cadence", "dropped_frames"],
        });
    });

    it("marks torso border as warning and propagates the deterministic guide text", () => {
        const score = createScore({
            pose: createPose({
                leftShoulder: createPoint(0.03, 0.32),
            }),
        });

        expect(score.components.torsoInFrame).toMatchObject({
            status: "warn",
            reasonCodes: ["torso_near_border"],
        });
        expect(score.components.borderRisk).toMatchObject({
            status: "bad",
            reasonCodes: ["torso_near_border"],
        });
        expect(score.guideMessages[0]).toEqual({
            code: "torso_near_border",
            text: "少し下がってください",
            severity: "bad",
        });
    });

    it("detects hands out of frame as both hands and border risk reasons", () => {
        const score = createScore({
            pose: createPose({
                rightWrist: createPoint(1.2, 0.64),
            }),
        });

        expect(score.components.handsInFrame).toMatchObject({
            status: "bad",
            reasonCodes: ["hand_out_of_frame"],
        });
        expect(score.components.borderRisk).toMatchObject({
            status: "bad",
            reasonCodes: expect.arrayContaining(["hand_out_of_frame"]),
        });
    });

    it("returns unknown border risk when all torso and hand points are missing", () => {
        const missingPoint = createPoint(0.5, 0.5, { tracked: false });
        const score = createScore({
            pose: createPose({
                leftShoulder: missingPoint,
                rightShoulder: missingPoint,
                leftHip: missingPoint,
                rightHip: missingPoint,
                leftElbow: missingPoint,
                leftWrist: missingPoint,
                rightElbow: missingPoint,
                rightWrist: missingPoint,
            }),
        });

        expect(score.components.borderRisk).toMatchObject({
            status: "unknown",
            score: 0,
            reasonCodes: [],
        });
    });

    it("detects small hands from wrist-elbow 2D distance", () => {
        const score = createScore({
            pose: createPose({
                leftElbow: createPoint(0.34, 0.54),
                leftWrist: createPoint(0.36, 0.55),
            }),
        });

        expect(score.components.handSmallRisk).toMatchObject({
            status: "bad",
            reasonCodes: ["hand_too_small"],
        });
    });

    it("uses v1 proxy only for motion blur risk", () => {
        const bad = createScore({ trackSettings: { width: 1280, height: 720, frameRate: 7 } });
        const warn = createScore({
            trackSettings: { width: 1280, height: 720, frameRate: 30 },
            poseSamples: Array.from({ length: 10 }, (_, index) => ({
                poseDetected: true,
                poseConfidence: index < 6 ? 0.2 : 0.8,
            })),
        });

        expect(bad.components.motionBlurRisk).toMatchObject({
            status: "bad",
            reasonCodes: ["motion_blur_risk"],
        });
        expect(warn.components.motionBlurRisk).toMatchObject({
            status: "warn",
            reasonCodes: ["motion_blur_risk"],
        });
    });

    it("limits guide messages to three unique fixed texts by reason priority", () => {
        const score = createScore({
            trackSettings: { width: 320, height: 240, frameRate: 7 },
            pose: createPose({
                leftShoulder: createPoint(-0.2, 0.32),
                rightWrist: createPoint(1.2, 0.64),
                leftElbow: createPoint(0.34, 0.54),
                leftWrist: createPoint(0.36, 0.55),
            }),
            timingHistory: createTimingHistory(30, 140, 1),
        });

        expect(score.guideMessages).toEqual([
            {
                code: "torso_out_of_frame",
                text: "体を画面中央に入れてください",
                severity: "bad",
            },
            {
                code: "torso_near_border",
                text: "少し下がってください",
                severity: "bad",
            },
            {
                code: "hand_out_of_frame",
                text: "手が画面から出ないようにしてください",
                severity: "bad",
            },
        ]);
    });

    it("uses all seven components for overall status thresholds", () => {
        const score = createScore({
            timingHistory: createTimingHistory(4, 33),
        });

        expect(score.overall.score).toBeCloseTo(6 / 7);
        expect(score.overall.status).toBe("good");
    });
});
