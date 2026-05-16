export type SincroPoseTargetQuality = "strong" | "weak" | "lost";

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
};

export type SincroPoseArmTargetSnapshot = {
    shoulder: SincroPoseTargetPointSnapshot;
    elbow: SincroPoseTargetPointSnapshot;
    wrist: SincroPoseTargetPointSnapshot;
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
    inferenceTimeMs: number;
    inferenceFps: number;
    consecutiveFailures: number;
    degradedToFaceOnly: boolean;
    lastUpdatedAtMs: number | null;
    fallbackReason: string | null;
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
};

export const DEFAULT_SINCRO_POSE_ARM_TARGET_SNAPSHOT: SincroPoseArmTargetSnapshot = {
    shoulder: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    elbow: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
    wrist: { ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT },
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
    inferenceTimeMs: 0,
    inferenceFps: 0,
    consecutiveFailures: 0,
    degradedToFaceOnly: false,
    lastUpdatedAtMs: null,
    fallbackReason: null,
};
