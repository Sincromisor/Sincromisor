export type SincroPoseTargetQuality = "strong" | "weak" | "lost";

export type SincroPoseWorldAnchor = "shoulder_center" | "hips_center" | "none";

export type SincroPoseWorldTargetSnapshot = {
    coordinateSystem: "mediapipe_world";
    anchor: SincroPoseWorldAnchor;
    hasWorldCoordinates: boolean;
    worldQuality: SincroPoseTargetQuality;
    worldConfidence: number;
    worldUsableForIk: boolean;
    worldIkWeight: number;
    worldStaleReason: string | null;
    rawX: number | null;
    rawY: number | null;
    rawZ: number | null;
    localX: number | null;
    localY: number | null;
    localZ: number | null;
    normalizedX: number | null;
    normalizedY: number | null;
    normalizedZ: number | null;
};

export type SincroPoseTargetPointSnapshot = {
    tracked: boolean;
    quality: SincroPoseTargetQuality;
    confidence: number;
    visibility: number;
    presence: number;
    hasFiniteCoordinates: boolean;
    usableForIk: boolean;
    ikWeight: number;
    stale: boolean;
    staleReason: string | null;
    cameraX: number;
    cameraY: number;
    cameraZ: number | null;
    localX: number;
    localY: number;
    localZ: number | null;
    world: SincroPoseWorldTargetSnapshot;
};

export type SincroPoseArmTargetSnapshot = {
    shoulder: SincroPoseTargetPointSnapshot;
    elbow: SincroPoseTargetPointSnapshot;
    wrist: SincroPoseTargetPointSnapshot;
};

export type SincroPoseLowerBodyTargetSnapshot = {
    leftHip: SincroPoseTargetPointSnapshot;
    rightHip: SincroPoseTargetPointSnapshot;
    leftKnee: SincroPoseTargetPointSnapshot;
    rightKnee: SincroPoseTargetPointSnapshot;
    leftAnkle: SincroPoseTargetPointSnapshot;
    rightAnkle: SincroPoseTargetPointSnapshot;
};

export type SincroPoseArmMotionSnapshot = {
    tracked: boolean;
    confidence: number;
    upperArmLift: number;
    upperArmOpen: number;
    lowerArmFlex: number;
    wristRaise: number;
    targets: SincroPoseArmTargetSnapshot;
};

export type SincroPoseUpperBodyMotionSnapshot = {
    shoulderRoll: number;
    torsoLean: number;
    shoulderWidth: number;
    shoulderCenterX: number;
    shoulderCenterY: number;
    hipCenterTracked: boolean;
};

export type SincroPoseMotionSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    confidence: number;
    upperBody: SincroPoseUpperBodyMotionSnapshot;
    leftArm: SincroPoseArmMotionSnapshot;
    rightArm: SincroPoseArmMotionSnapshot;
    lowerBodyTargets: SincroPoseLowerBodyTargetSnapshot;
    inferenceTimeMs: number;
    inferenceFps: number;
    consecutiveFailures: number;
    degradedToFaceOnly: boolean;
    lastUpdatedAtMs: number | null;
    fallbackReason: string | null;
};

export const DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT: SincroPoseWorldTargetSnapshot = {
    coordinateSystem: "mediapipe_world",
    anchor: "none",
    hasWorldCoordinates: false,
    worldQuality: "lost",
    worldConfidence: 0,
    worldUsableForIk: false,
    worldIkWeight: 0,
    worldStaleReason: "world_not_tracked",
    rawX: null,
    rawY: null,
    rawZ: null,
    localX: null,
    localY: null,
    localZ: null,
    normalizedX: null,
    normalizedY: null,
    normalizedZ: null,
};

export const DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT: SincroPoseTargetPointSnapshot = {
    tracked: false,
    quality: "lost",
    confidence: 0,
    visibility: 0,
    presence: 0,
    hasFiniteCoordinates: false,
    usableForIk: false,
    ikWeight: 0,
    stale: true,
    staleReason: "not_tracked",
    cameraX: 0.5,
    cameraY: 0.5,
    cameraZ: null,
    localX: 0,
    localY: 0,
    localZ: null,
    world: { ...DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT },
};

export const DEFAULT_SINCRO_POSE_ARM_TARGET_SNAPSHOT: SincroPoseArmTargetSnapshot = {
    shoulder: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    elbow: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    wrist: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
};

export const DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT: SincroPoseLowerBodyTargetSnapshot = {
    leftHip: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    rightHip: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    leftKnee: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    rightKnee: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    leftAnkle: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    rightAnkle: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
};

export const DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT: SincroPoseArmMotionSnapshot = {
    tracked: false,
    confidence: 0,
    upperArmLift: 0,
    upperArmOpen: 0,
    lowerArmFlex: 0,
    wristRaise: 0,
    targets: {
        shoulder: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
        elbow: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
        wrist: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    },
};

export const DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT: SincroPoseMotionSnapshot = {
    trackingEnabled: false,
    detected: false,
    confidence: 0,
    upperBody: {
        shoulderRoll: 0,
        torsoLean: 0,
        shoulderWidth: 0,
        shoulderCenterX: 0.5,
        shoulderCenterY: 0.5,
        hipCenterTracked: false,
    },
    leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
    rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
    lowerBodyTargets: { ...DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT },
    inferenceTimeMs: 0,
    inferenceFps: 0,
    consecutiveFailures: 0,
    degradedToFaceOnly: false,
    lastUpdatedAtMs: null,
    fallbackReason: null,
};
