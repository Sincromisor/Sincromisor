import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type {
    SincroPoseTargetPointSnapshot,
    SincroPoseTargetQuality,
} from "./SincroPoseMotionSnapshot";

export const SINCRO_POSE_MIN_LANDMARK_VISIBILITY = 0.45;
const MIN_IK_ELBOW_CONFIDENCE = 0.38;
const MIN_IK_WRIST_CONFIDENCE = 0.04;
const IK_FRAME_MARGIN = 0.08;

export type PoseTargetJoint = "shoulder" | "elbow" | "wrist";

export type PoseTargetPointOrigin = {
    shoulderWidth: number;
    shoulderCenterX: number;
    shoulderCenterY: number;
};

export function createSincroPoseTargetPoint(
    landmark: NormalizedLandmark | undefined,
    joint: PoseTargetJoint,
    origin: PoseTargetPointOrigin,
): SincroPoseTargetPointSnapshot {
    const pointVisibility = visibility(landmark);
    const pointPresence = presence(landmark);
    const confidence = Math.min(pointVisibility, pointPresence);
    const hasPoint = landmark != null;
    const hasFiniteCoordinates = hasPoint && coordinatesAreFinite(landmark);
    const withinIkFrame = hasFiniteCoordinates && coordinatesAreInIkFrame(landmark);
    const tracked = hasFiniteCoordinates && confidence >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY;
    const ikWeight = ikTargetWeight(confidence, joint, withinIkFrame);
    const usableForIk = ikWeight > 0;
    const quality = targetQuality(tracked, usableForIk);
    const cameraX = hasFiniteCoordinates ? clamp01(landmark.x) : 0.5;
    const cameraY = hasFiniteCoordinates ? clamp01(landmark.y) : 0.5;
    const cameraZ = hasPoint && Number.isFinite(landmark.z) ? landmark.z : null;

    // IK solver が confidence gate と座標正規化を分けて判断できるよう、
    // target の追跡品質と肩幅基準の 2D 座標を同じ snapshot に載せる。
    return {
        tracked,
        quality,
        confidence,
        visibility: pointVisibility,
        presence: pointPresence,
        hasFiniteCoordinates,
        usableForIk,
        ikWeight,
        stale: !tracked,
        staleReason: tracked
            ? null
            : staleReason(hasPoint, hasFiniteCoordinates, withinIkFrame, confidence),
        cameraX,
        cameraY,
        cameraZ,
        localX: clampRange((cameraX - origin.shoulderCenterX) / origin.shoulderWidth, -3, 3),
        localY: clampRange((origin.shoulderCenterY - cameraY) / origin.shoulderWidth, -3, 3),
        localZ: cameraZ == null ? null : clampRange(cameraZ / origin.shoulderWidth, -3, 3),
    };
}

export function poseLandmarkVisibility(landmark: NormalizedLandmark | undefined): number {
    return visibility(landmark);
}

function visibility(landmark: NormalizedLandmark | undefined): number {
    return clamp01(landmark?.visibility ?? 0);
}

function presence(landmark: NormalizedLandmark | undefined): number {
    if (!landmark) {
        return 0;
    }
    const rawPresence = "presence" in landmark ? landmark.presence : undefined;
    return clamp01(typeof rawPresence === "number" ? rawPresence : landmark.visibility);
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampRange(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function coordinatesAreFinite(landmark: NormalizedLandmark): boolean {
    return Number.isFinite(landmark.x) && Number.isFinite(landmark.y);
}

function coordinatesAreInIkFrame(landmark: NormalizedLandmark): boolean {
    return (
        landmark.x >= -IK_FRAME_MARGIN &&
        landmark.x <= 1 + IK_FRAME_MARGIN &&
        landmark.y >= -IK_FRAME_MARGIN &&
        landmark.y <= 1 + IK_FRAME_MARGIN
    );
}

function ikTargetWeight(
    confidence: number,
    joint: PoseTargetJoint,
    withinIkFrame: boolean,
): number {
    if (!withinIkFrame) {
        return 0;
    }
    if (joint === "wrist") {
        return weakTargetWeight(confidence, MIN_IK_WRIST_CONFIDENCE);
    }
    if (joint === "elbow") {
        return weakTargetWeight(confidence, MIN_IK_ELBOW_CONFIDENCE);
    }
    return confidence >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY ? 1 : 0;
}

function weakTargetWeight(confidence: number, minConfidence: number): number {
    if (confidence < minConfidence) {
        return 0;
    }
    if (confidence >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY) {
        return 1;
    }
    return Math.max(0.18, confidence / SINCRO_POSE_MIN_LANDMARK_VISIBILITY);
}

function targetQuality(tracked: boolean, usableForIk: boolean): SincroPoseTargetQuality {
    if (tracked) {
        return "strong";
    }
    return usableForIk ? "weak" : "lost";
}

function staleReason(
    hasPoint: boolean,
    hasFiniteCoordinates: boolean,
    withinIkFrame: boolean,
    confidence: number,
): string {
    if (!hasPoint) {
        return "landmark_missing";
    }
    if (!hasFiniteCoordinates) {
        return "non_finite_coordinates";
    }
    if (!withinIkFrame) {
        return "out_of_frame";
    }
    if (confidence < SINCRO_POSE_MIN_LANDMARK_VISIBILITY) {
        return "low_confidence";
    }
    return "not_tracked";
}
