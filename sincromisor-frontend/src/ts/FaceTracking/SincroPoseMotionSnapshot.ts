export type SincroPoseArmMotionSnapshot = {
    tracked: boolean;
    confidence: number;
    upperArmLift: number;
    upperArmOpen: number;
    lowerArmFlex: number;
    wristRaise: number;
};

export type SincroPoseUpperBodyMotionSnapshot = {
    shoulderRoll: number;
    torsoLean: number;
    shoulderWidth: number;
    shoulderCenterX: number;
    shoulderCenterY: number;
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

export const DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT: SincroPoseArmMotionSnapshot = {
    tracked: false,
    confidence: 0,
    upperArmLift: 0,
    upperArmOpen: 0,
    lowerArmFlex: 0,
    wristRaise: 0,
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
