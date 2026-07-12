import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";

export type SincroFaceHeadPoseSnapshot = {
    yawDeg: number;
    pitchDeg: number;
    rollDeg: number;
    matrix?: number[];
};

export type SincroFaceMotionSource = "roi" | "full-frame" | "full-frame-fallback" | "lost";

export type SincroFaceMotionSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    confidence: number;
    headPose: SincroFaceHeadPoseSnapshot;
    blendshapes: Record<string, number>;
    roi?: SincroRoiObservation;
    source?: SincroFaceMotionSource;
    warnings: string[];
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
    source: "lost",
    warnings: [],
    inferenceTimeMs: 0,
    inferenceFps: 0,
};

export function cloneSincroRoiObservation(
    roi: SincroRoiObservation | undefined,
): SincroRoiObservation | undefined {
    if (roi === undefined) {
        return undefined;
    }
    return {
        ...roi,
        rect: { ...roi.rect },
        referencePoint:
            roi.referencePoint === undefined
                ? undefined
                : [roi.referencePoint[0], roi.referencePoint[1]],
        warnings: [...roi.warnings],
    };
}
