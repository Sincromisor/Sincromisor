export type SincroFaceHeadPoseSnapshot = {
    yawDeg: number;
    pitchDeg: number;
    rollDeg: number;
    matrix: number[] | null;
};

export type SincroFaceMotionSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    confidence: number;
    headPose: SincroFaceHeadPoseSnapshot;
    blendshapes: Record<string, number>;
    inferenceTimeMs: number;
    inferenceFps: number;
    lastUpdatedAtMs: number | null;
    fallbackReason: string | null;
};

export const DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT: SincroFaceMotionSnapshot = {
    trackingEnabled: false,
    detected: false,
    confidence: 0,
    headPose: {
        yawDeg: 0,
        pitchDeg: 0,
        rollDeg: 0,
        matrix: null,
    },
    blendshapes: {},
    inferenceTimeMs: 0,
    inferenceFps: 0,
    lastUpdatedAtMs: null,
    fallbackReason: null,
};
