import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";

export type SincroHandTuple3 = readonly [number, number, number];
export type SincroHandPoint2 = readonly [number, number];

export type SincroHandSource = "roi" | "full-frame-fallback" | "previous" | "lost";

export type SincroHandWarningCode =
    | "roi_missing"
    | "roi_inconsistent"
    | "side_inconsistent"
    | "duplicate_assignment"
    | "landmarks_missing"
    | "low_confidence"
    | "pose_stale_for_roi"
    | "model_not_loaded";

export type SincroHandFeatureSnapshot = {
    palmNormal: SincroHandTuple3;
    palmDirection: SincroHandTuple3;
    fingerCurl: {
        thumb: number;
        index: number;
        middle: number;
        ring: number;
        little: number;
    };
    fingerSplay: {
        indexMiddle: number;
        middleRing: number;
        ringLittle: number;
    };
    thumbOppose: number;
    openness: "open" | "half" | "closed" | "unknown";
};

export type SincroHandSideSnapshot = {
    detected: boolean;
    assignedSide: "left" | "right";
    source: SincroHandSource;
    confidence: number;
    handednessLabel?: string;
    handednessScore: number;
    roi?: SincroRoiObservation;
    fullFrameWrist?: SincroHandPoint2;
    features: SincroHandFeatureSnapshot;
    warnings: SincroHandWarningCode[];
};

export type SincroHandMotionSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    leftHand: SincroHandSideSnapshot;
    rightHand: SincroHandSideSnapshot;
    inferenceTimeMs: number;
    inferenceFps: number;
    lastUpdatedAtMs?: number;
    fallbackReason?: string;
};

export const DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT: SincroHandFeatureSnapshot = {
    palmNormal: [0, 0, 1],
    palmDirection: [0, -1, 0],
    fingerCurl: {
        thumb: 0,
        index: 0,
        middle: 0,
        ring: 0,
        little: 0,
    },
    fingerSplay: {
        indexMiddle: 0,
        middleRing: 0,
        ringLittle: 0,
    },
    thumbOppose: 0,
    openness: "unknown",
};

export const DEFAULT_SINCRO_LEFT_HAND_SNAPSHOT: SincroHandSideSnapshot = {
    detected: false,
    assignedSide: "left",
    source: "lost",
    confidence: 0,
    handednessScore: 0,
    features: DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    warnings: ["landmarks_missing"],
};

export const DEFAULT_SINCRO_RIGHT_HAND_SNAPSHOT: SincroHandSideSnapshot = {
    detected: false,
    assignedSide: "right",
    source: "lost",
    confidence: 0,
    handednessScore: 0,
    features: DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    warnings: ["landmarks_missing"],
};

export const DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT: SincroHandMotionSnapshot = {
    trackingEnabled: false,
    detected: false,
    leftHand: DEFAULT_SINCRO_LEFT_HAND_SNAPSHOT,
    rightHand: DEFAULT_SINCRO_RIGHT_HAND_SNAPSHOT,
    inferenceTimeMs: 0,
    inferenceFps: 0,
};

export function cloneSincroHandMotionSnapshot(
    snapshot: SincroHandMotionSnapshot,
): SincroHandMotionSnapshot {
    return {
        ...snapshot,
        leftHand: cloneSincroHandSideSnapshot(snapshot.leftHand),
        rightHand: cloneSincroHandSideSnapshot(snapshot.rightHand),
    };
}

export function createSincroHandFallbackSnapshot(input: {
    reason?: string;
    nowMs?: number;
    trackingEnabled?: boolean;
    warnings?: SincroHandWarningCode[];
}): SincroHandMotionSnapshot {
    const warnings = uniqueHandWarnings(["landmarks_missing", ...(input.warnings ?? [])]);
    const leftHand = createLostHandSideSnapshot("left", warnings);
    const rightHand = createLostHandSideSnapshot("right", warnings);
    return {
        ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
        trackingEnabled: input.trackingEnabled ?? true,
        detected: false,
        leftHand,
        rightHand,
        fallbackReason: input.reason,
        lastUpdatedAtMs: input.nowMs,
    };
}

export function createLostHandSideSnapshot(
    assignedSide: "left" | "right",
    warnings: SincroHandWarningCode[] = ["landmarks_missing"],
): SincroHandSideSnapshot {
    return {
        ...(assignedSide === "left"
            ? DEFAULT_SINCRO_LEFT_HAND_SNAPSHOT
            : DEFAULT_SINCRO_RIGHT_HAND_SNAPSHOT),
        assignedSide,
        features: cloneSincroHandFeatureSnapshot(DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT),
        warnings: uniqueHandWarnings(warnings),
    };
}

export function cloneSincroHandSideSnapshot(
    snapshot: SincroHandSideSnapshot,
): SincroHandSideSnapshot {
    return {
        ...snapshot,
        roi: cloneSincroRoiObservation(snapshot.roi),
        fullFrameWrist:
            snapshot.fullFrameWrist === undefined
                ? undefined
                : [snapshot.fullFrameWrist[0], snapshot.fullFrameWrist[1]],
        features: cloneSincroHandFeatureSnapshot(snapshot.features),
        warnings: [...snapshot.warnings],
    };
}

export function cloneSincroHandFeatureSnapshot(
    snapshot: SincroHandFeatureSnapshot,
): SincroHandFeatureSnapshot {
    return {
        palmNormal: [snapshot.palmNormal[0], snapshot.palmNormal[1], snapshot.palmNormal[2]],
        palmDirection: [
            snapshot.palmDirection[0],
            snapshot.palmDirection[1],
            snapshot.palmDirection[2],
        ],
        fingerCurl: { ...snapshot.fingerCurl },
        fingerSplay: { ...snapshot.fingerSplay },
        thumbOppose: snapshot.thumbOppose,
        openness: snapshot.openness,
    };
}

export function uniqueHandWarnings(
    warnings: readonly SincroHandWarningCode[],
): SincroHandWarningCode[] {
    return warnings.filter((warning, index) => warnings.indexOf(warning) === index);
}

function cloneSincroRoiObservation(
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
