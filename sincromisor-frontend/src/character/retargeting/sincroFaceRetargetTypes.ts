export type SincroFaceRotation = { x: number; y: number; z: number };

export type SincroFaceNeutralPose = {
    yawDeg: number;
    pitchDeg: number;
    rollDeg: number;
};

export type SincroFaceRetargetedHeadPose = {
    upperChest: SincroFaceRotation;
    neck: SincroFaceRotation;
    head: SincroFaceRotation;
};

export type SincroFaceRetargetedExpressions = {
    blink: number;
    blinkLeft: number;
    blinkRight: number;
    lookLeft: number;
    lookRight: number;
    lookUp: number;
    lookDown: number;
    aa: number;
    ih: number;
    ou: number;
    ee: number;
    oh: number;
};

export type SincroFaceRetargetFrame = {
    active: boolean;
    confidence: number;
    head: SincroFaceRetargetedHeadPose;
    expressions: SincroFaceRetargetedExpressions;
};

export type SincroFaceRetargetConfig = {
    minConfidence: number;
    neutralLearningMs: number;
    returnToNeutralMs: number;
    headSmoothingMs: number;
    expressionSmoothingMs: number;
    headDeadbandDeg: number;
    expressionDeadband: number;
    blinkCalibration: {
        openThreshold: number;
        closeThreshold: number;
        gamma: number;
    };
    mirrorYaw: boolean;
    headInputScale: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    maxHeadDeg: {
        yaw: number;
        pitch: number;
        roll: number;
    };
    headBoneWeights: {
        upperChest: number;
        neck: number;
        head: number;
    };
};

export const DEFAULT_SINCRO_FACE_RETARGET_CONFIG: SincroFaceRetargetConfig = {
    minConfidence: 0.08,
    neutralLearningMs: 900,
    returnToNeutralMs: 420,
    headSmoothingMs: 115,
    expressionSmoothingMs: 70,
    headDeadbandDeg: 1.2,
    expressionDeadband: 0.035,
    blinkCalibration: {
        openThreshold: 0.22,
        closeThreshold: 0.62,
        gamma: 0.72,
    },
    mirrorYaw: false,
    headInputScale: {
        yaw: 0.58,
        pitch: 0.52,
        roll: 0.42,
    },
    maxHeadDeg: {
        yaw: 18,
        pitch: 12,
        roll: 9,
    },
    headBoneWeights: {
        upperChest: 0.18,
        neck: 0.52,
        head: 0.3,
    },
};

export const NEUTRAL_SINCRO_FACE_EXPRESSIONS: SincroFaceRetargetedExpressions = {
    blink: 0,
    blinkLeft: 0,
    blinkRight: 0,
    lookLeft: 0,
    lookRight: 0,
    lookUp: 0,
    lookDown: 0,
    aa: 0,
    ih: 0,
    ou: 0,
    ee: 0,
    oh: 0,
};

export const NEUTRAL_SINCRO_FACE_HEAD: SincroFaceRetargetedHeadPose = {
    upperChest: { x: 0, y: 0, z: 0 },
    neck: { x: 0, y: 0, z: 0 },
    head: { x: 0, y: 0, z: 0 },
};
