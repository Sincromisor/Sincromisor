import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { type PoseWorldTargetOrigin, poseLandmarkVisibility } from "./sincroPoseTargetPoint";

export const SINCRO_POSE_LANDMARK = {
    leftShoulder: 11,
    rightShoulder: 12,
    leftElbow: 13,
    rightElbow: 14,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28,
} as const;

// MediaPipe world landmark の基準点を作り、IK target のローカル化で使う anchor を揃える。
export function createSincroPoseWorldTargetOrigins(worldLandmarks: Landmark[] | undefined): {
    shoulders: PoseWorldTargetOrigin | undefined;
    hips: PoseWorldTargetOrigin | undefined;
} {
    const leftShoulder = worldLandmarks?.[SINCRO_POSE_LANDMARK.leftShoulder];
    const rightShoulder = worldLandmarks?.[SINCRO_POSE_LANDMARK.rightShoulder];
    const leftHip = worldLandmarks?.[SINCRO_POSE_LANDMARK.leftHip];
    const rightHip = worldLandmarks?.[SINCRO_POSE_LANDMARK.rightHip];
    const shoulderScale =
        leftShoulder && rightShoulder ? finiteDistance3d(leftShoulder, rightShoulder) : undefined;
    const hipScale = leftHip && rightHip ? finiteDistance3d(leftHip, rightHip) : undefined;
    const scale = shoulderScale ?? hipScale;

    return {
        shoulders:
            leftShoulder && rightShoulder && scale
                ? createWorldTargetOrigin("shoulder_center", leftShoulder, rightShoulder, scale)
                : undefined,
        hips:
            leftHip && rightHip && scale
                ? createWorldTargetOrigin("hips_center", leftHip, rightHip, scale)
                : undefined,
    };
}

export function averagePoseLandmarkVisibility(
    landmarks: (NormalizedLandmark | undefined)[],
): number {
    if (landmarks.length === 0) {
        return 0;
    }
    return (
        landmarks.reduce((sum, landmark) => sum + poseLandmarkVisibility(landmark), 0) /
        landmarks.length
    );
}

export function poseLandmarkDistance2d(a: NormalizedLandmark, b: NormalizedLandmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function poseLandmarkAngleAt(
    center: NormalizedLandmark,
    a: NormalizedLandmark,
    b: NormalizedLandmark,
): number {
    const ax = a.x - center.x;
    const ay = a.y - center.y;
    const bx = b.x - center.x;
    const by = b.y - center.y;
    const magnitude = Math.max(Math.hypot(ax, ay) * Math.hypot(bx, by), 1e-6);
    return Math.acos(clampSigned((ax * bx + ay * by) / magnitude));
}

export function clamp01(value: number): number {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function clampSigned(value: number): number {
    return Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
}

function poseLandmarkDistance3d(a: Landmark, b: Landmark): number {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function createWorldTargetOrigin(
    anchor: PoseWorldTargetOrigin["anchor"],
    left: Landmark,
    right: Landmark,
    scale: number,
): PoseWorldTargetOrigin | undefined {
    if (!landmark3dIsFinite(left) || !landmark3dIsFinite(right) || scale <= 0) {
        return undefined;
    }
    return {
        anchor,
        anchorX: (left.x + right.x) * 0.5,
        anchorY: (left.y + right.y) * 0.5,
        anchorZ: (left.z + right.z) * 0.5,
        scale,
    };
}

function finiteDistance3d(a: Landmark, b: Landmark): number | undefined {
    if (!landmark3dIsFinite(a) || !landmark3dIsFinite(b)) {
        return undefined;
    }
    const distance = poseLandmarkDistance3d(a, b);
    return distance > 1e-4 ? distance : undefined;
}

function landmark3dIsFinite(landmark: Landmark): boolean {
    return (
        Number.isFinite(landmark.x) && Number.isFinite(landmark.y) && Number.isFinite(landmark.z)
    );
}
