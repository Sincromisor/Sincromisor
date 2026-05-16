import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import type {
    SincroPoseTargetPointSnapshot,
    SincroPoseTargetQuality,
    SincroPoseWorldAnchor,
    SincroPoseWorldTargetSnapshot,
} from "./SincroPoseMotionSnapshot";

export const SINCRO_POSE_MIN_LANDMARK_VISIBILITY = 0.45;
const MIN_IK_ELBOW_CONFIDENCE = 0.38;
const MIN_IK_KNEE_CONFIDENCE = 0.38;
const MIN_IK_WRIST_CONFIDENCE = 0.04;
const MIN_IK_ANKLE_CONFIDENCE = 0.04;
const IK_FRAME_MARGIN = 0.08;

export type PoseTargetJoint = "shoulder" | "elbow" | "wrist" | "hip" | "knee" | "ankle";

export type PoseTargetPointOrigin = {
    imageScale: number;
    anchorX: number;
    anchorY: number;
};

export type PoseWorldTargetOrigin = {
    anchor: SincroPoseWorldAnchor;
    anchorX: number;
    anchorY: number;
    anchorZ: number;
    scale: number;
};

export function createSincroPoseTargetPoint(
    landmark: NormalizedLandmark | undefined,
    worldLandmark: Landmark | undefined,
    joint: PoseTargetJoint,
    imageOrigin: PoseTargetPointOrigin,
    worldOrigin: PoseWorldTargetOrigin | null,
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

    // 2D image target と MediaPipe world target は寿命と品質 gate が異なる。
    // IK solver が段階導入できるよう、同じ joint snapshot 内で別々に評価する。
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
        localX: clampRange((cameraX - imageOrigin.anchorX) / imageOrigin.imageScale, -3, 3),
        localY: clampRange((imageOrigin.anchorY - cameraY) / imageOrigin.imageScale, -3, 3),
        localZ: cameraZ == null ? null : clampRange(cameraZ / imageOrigin.imageScale, -3, 3),
        world: createWorldTargetPoint(worldLandmark, joint, worldOrigin, confidence),
    };
}

export function poseLandmarkVisibility(landmark: NormalizedLandmark | undefined): number {
    return visibility(landmark);
}

function visibility(landmark: Landmark | NormalizedLandmark | undefined): number {
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

function createWorldTargetPoint(
    landmark: Landmark | undefined,
    joint: PoseTargetJoint,
    origin: PoseWorldTargetOrigin | null,
    imageConfidence: number,
): SincroPoseWorldTargetSnapshot {
    const hasPoint = landmark != null;
    const hasFiniteCoordinates = hasPoint && worldCoordinatesAreFinite(landmark);
    const hasUsableOrigin = origin != null && worldOriginIsFinite(origin);
    const hasWorldCoordinates = hasFiniteCoordinates && hasUsableOrigin;
    const worldConfidence = Math.min(imageConfidence, visibility(landmark));
    const worldIkWeight = hasWorldCoordinates ? ikTargetWeight(worldConfidence, joint, true) : 0;
    const worldUsableForIk = worldIkWeight > 0;
    const localX = hasWorldCoordinates ? landmark.x - origin.anchorX : null;
    const localY = hasWorldCoordinates ? landmark.y - origin.anchorY : null;
    const localZ = hasWorldCoordinates ? landmark.z - origin.anchorZ : null;

    return {
        coordinateSystem: "mediapipe_world",
        anchor: origin?.anchor ?? "none",
        hasWorldCoordinates,
        worldQuality: targetQuality(
            hasWorldCoordinates && worldConfidence >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY,
            worldUsableForIk,
        ),
        worldConfidence,
        worldUsableForIk,
        worldIkWeight,
        worldStaleReason: hasWorldCoordinates
            ? null
            : worldStaleReason(hasPoint, hasFiniteCoordinates, hasUsableOrigin),
        rawX: hasPoint && Number.isFinite(landmark.x) ? landmark.x : null,
        rawY: hasPoint && Number.isFinite(landmark.y) ? landmark.y : null,
        rawZ: hasPoint && Number.isFinite(landmark.z) ? landmark.z : null,
        localX,
        localY,
        localZ,
        normalizedX: localX == null || !origin ? null : clampRange(localX / origin.scale, -3, 3),
        normalizedY: localY == null || !origin ? null : clampRange(localY / origin.scale, -3, 3),
        normalizedZ: localZ == null || !origin ? null : clampRange(localZ / origin.scale, -3, 3),
    };
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
    if (joint === "ankle") {
        return weakTargetWeight(confidence, MIN_IK_ANKLE_CONFIDENCE);
    }
    if (joint === "knee") {
        return weakTargetWeight(confidence, MIN_IK_KNEE_CONFIDENCE);
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

function worldCoordinatesAreFinite(landmark: Landmark): boolean {
    return (
        Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && Number.isFinite(landmark.z)
    );
}

function worldOriginIsFinite(origin: PoseWorldTargetOrigin): boolean {
    return (
        Number.isFinite(origin.anchorX) &&
        Number.isFinite(origin.anchorY) &&
        Number.isFinite(origin.anchorZ) &&
        Number.isFinite(origin.scale) &&
        origin.scale > 0
    );
}

function worldStaleReason(
    hasPoint: boolean,
    hasFiniteCoordinates: boolean,
    hasUsableOrigin: boolean,
): string {
    if (!hasPoint) {
        return "world_landmark_missing";
    }
    if (!hasFiniteCoordinates) {
        return "world_non_finite_coordinates";
    }
    if (!hasUsableOrigin) {
        return "world_anchor_missing";
    }
    return "world_not_tracked";
}
