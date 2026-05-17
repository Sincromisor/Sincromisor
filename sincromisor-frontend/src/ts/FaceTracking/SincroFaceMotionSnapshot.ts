export type SincroFaceHeadPoseSnapshot = {
    yawDeg: number;
    pitchDeg: number;
    rollDeg: number;
    matrix?: number[];
};

export type SincroFaceMotionSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    confidence: number;
    headPose: SincroFaceHeadPoseSnapshot;
    blendshapes: Record<string, number>;
    inferenceTimeMs: number;
    inferenceFps: number;
    lastUpdatedAtMs?: number;
    fallbackReason?: string;
};

export const DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT: SincroFaceMotionSnapshot = {
    trackingEnabled: false,
    detected: false,
    confidence: 0,
    headPose: {
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
    },
    blendshapes: {},
    inferenceTimeMs: 0,
    inferenceFps: 0,
};
