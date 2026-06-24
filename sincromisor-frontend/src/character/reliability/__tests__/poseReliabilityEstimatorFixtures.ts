import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
    DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { cloneSincroPoseMotionSnapshot } from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshotClone";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityScore,
} from "../../../features/gaze/trackingRuntime/cameraQualityScore";
import { createPoseReliabilityMap } from "../poseReliabilityEstimator";

export function createCameraQuality(score: number): CameraQualityScore {
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

export function createPoint(
    camera: readonly [number, number],
    world: readonly [number, number, number],
    options: {
        quality?: SincroPoseTargetPointSnapshot["quality"];
        hasWorldCoordinates?: boolean;
    } = {},
): SincroPoseTargetPointSnapshot {
    const quality = options.quality ?? "strong";
    const tracked = quality !== "lost";
    const hasWorldCoordinates = options.hasWorldCoordinates ?? true;
    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        tracked,
        quality,
        confidence: tracked ? 0.9 : 0,
        visibility: tracked ? 0.9 : 0,
        presence: tracked ? 0.9 : 0,
        hasFiniteCoordinates: tracked,
        usableForIk: tracked,
        ikWeight: tracked ? 1 : 0,
        stale: !tracked,
        staleReason: tracked ? undefined : "not_tracked",
        cameraX: camera[0],
        cameraY: camera[1],
        localX: world[0],
        localY: world[1],
        localZ: world[2],
        world: {
            ...DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT,
            anchor: "shoulder_center",
            hasWorldCoordinates,
            worldQuality: quality,
            worldConfidence: tracked ? 0.9 : 0,
            worldUsableForIk: hasWorldCoordinates && tracked,
            worldIkWeight: hasWorldCoordinates && tracked ? 1 : 0,
            normalizedX: hasWorldCoordinates ? world[0] : undefined,
            normalizedY: hasWorldCoordinates ? world[1] : undefined,
            normalizedZ: hasWorldCoordinates ? world[2] : undefined,
        },
    };
}

export function createPose(
    overrides: {
        detected?: boolean;
        fallbackReason?: string;
        shoulderWidth?: number;
        leftElbow?: SincroPoseTargetPointSnapshot;
        leftWrist?: SincroPoseTargetPointSnapshot;
        rightElbow?: SincroPoseTargetPointSnapshot;
        rightWrist?: SincroPoseTargetPointSnapshot;
    } = {},
): SincroPoseMotionSnapshot {
    const leftShoulder = createPoint([0.38, 0.32], [-0.5, 0, 0]);
    const rightShoulder = createPoint([0.62, 0.32], [0.5, 0, 0]);
    const leftElbow = overrides.leftElbow ?? createPoint([0.32, 0.5], [-0.9, -0.3, 0]);
    const leftWrist = overrides.leftWrist ?? createPoint([0.26, 0.68], [-1.3, -0.6, 0]);
    const rightElbow = overrides.rightElbow ?? createPoint([0.68, 0.5], [0.9, -0.3, 0]);
    const rightWrist = overrides.rightWrist ?? createPoint([0.74, 0.68], [1.3, -0.6, 0]);
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        detected: overrides.detected ?? true,
        confidence: overrides.detected === false ? 0 : 0.9,
        trackingEnabled: true,
        fallbackReason: overrides.fallbackReason,
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.32,
            shoulderWidth: overrides.shoulderWidth ?? 0.24,
            hipCenterTracked: true,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: leftElbow.tracked && leftWrist.tracked,
            confidence: 0.9,
            targets: { shoulder: leftShoulder, elbow: leftElbow, wrist: leftWrist },
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            tracked: rightElbow.tracked && rightWrist.tracked,
            confidence: 0.9,
            targets: { shoulder: rightShoulder, elbow: rightElbow, wrist: rightWrist },
        },
        lowerBodyTargets: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.lowerBodyTargets,
            leftHip: createPoint([0.42, 0.7], [-0.35, -1, 0]),
            rightHip: createPoint([0.58, 0.7], [0.35, -1, 0]),
        },
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: overrides.detected === false ? 1 : 0,
        degradedToFaceOnly: false,
        lastUpdatedAtMs: 100,
    });
}

export function createMap(
    pose: SincroPoseMotionSnapshot,
    options: {
        cameraQuality?: CameraQualityScore;
        previous?: { pose: SincroPoseMotionSnapshot; mediaTimeMs: number };
        mediaTimeMs?: number;
    } = {},
) {
    return createPoseReliabilityMap({
        pose,
        cameraQuality: options.cameraQuality ?? createCameraQuality(1),
        previous: options.previous,
        mediaTimeMs: options.mediaTimeMs ?? 1000,
        video: { width: 1280, height: 720 },
    });
}
