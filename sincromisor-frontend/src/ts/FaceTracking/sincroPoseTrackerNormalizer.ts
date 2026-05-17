import type { PoseLandmarkerResult } from "@mediapipe/tasks-vision";
import type { SincroPoseMotionSnapshot } from "./SincroPoseMotionSnapshot";
import {
    averagePoseLandmarkVisibility,
    clampSigned,
    createSincroPoseWorldTargetOrigins,
    poseLandmarkDistance2d,
    SINCRO_POSE_LANDMARK,
} from "./sincroPoseLandmarkGeometry";
import { createSincroPoseFallbackSnapshot } from "./sincroPoseMotionSnapshotClone";
import {
    poseLandmarkVisibility,
    SINCRO_POSE_MIN_LANDMARK_VISIBILITY,
} from "./sincroPoseTargetPoint";
import {
    createSincroPoseArmMotion,
    createSincroPoseLowerBodyTargets,
} from "./sincroPoseTrackerTargets";

type NormalizeSincroPoseResultOptions = {
    result: PoseLandmarkerResult;
    inferenceTimeMs: number;
    inferenceFps: number;
    nowMs: number;
    consecutiveFailures: number;
};

type NormalizedSincroPoseResult = {
    snapshot: SincroPoseMotionSnapshot;
    consecutiveFailures: number;
};

// PoseLandmarkerResult を retargeter/debug UI が読む低振幅 snapshot へ正規化する。
export function normalizeSincroPoseLandmarkerResult({
    result,
    inferenceTimeMs,
    inferenceFps,
    nowMs,
    consecutiveFailures,
}: NormalizeSincroPoseResultOptions): NormalizedSincroPoseResult {
    const landmarks = result.landmarks[0];
    const worldLandmarks = result.worldLandmarks[0];
    if (landmarks === undefined) {
        return createFailedPoseResult({
            reason: "pose_not_detected",
            inferenceTimeMs,
            inferenceFps,
            nowMs,
            consecutiveFailures: consecutiveFailures + 1,
        });
    }

    const leftShoulder = landmarks[SINCRO_POSE_LANDMARK.leftShoulder];
    const rightShoulder = landmarks[SINCRO_POSE_LANDMARK.rightShoulder];
    const leftHip = landmarks[SINCRO_POSE_LANDMARK.leftHip];
    const rightHip = landmarks[SINCRO_POSE_LANDMARK.rightHip];
    const shoulderConfidence = averagePoseLandmarkVisibility([leftShoulder, rightShoulder]);
    if (shoulderConfidence < SINCRO_POSE_MIN_LANDMARK_VISIBILITY) {
        return createFailedPoseResult({
            reason: "shoulders_low_confidence",
            inferenceTimeMs,
            inferenceFps,
            nowMs,
            consecutiveFailures: consecutiveFailures + 1,
        });
    }

    const shoulderWidth = Math.max(poseLandmarkDistance2d(leftShoulder, rightShoulder), 0.08);
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) * 0.5;
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) * 0.5;
    const hipCenterTracked =
        poseLandmarkVisibility(leftHip) >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY &&
        poseLandmarkVisibility(rightHip) >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY;
    const hipCenterX = hipCenterTracked ? (leftHip.x + rightHip.x) * 0.5 : shoulderCenterX;
    const hipCenterY = hipCenterTracked ? (leftHip.y + rightHip.y) * 0.5 : shoulderCenterY;
    const worldOrigins = createSincroPoseWorldTargetOrigins(worldLandmarks);
    const shoulderImageOrigin = {
        imageScale: shoulderWidth,
        anchorX: shoulderCenterX,
        anchorY: shoulderCenterY,
    };
    const hipsImageOrigin = {
        imageScale: shoulderWidth,
        anchorX: hipCenterX,
        anchorY: hipCenterY,
    };
    const leftArm = createSincroPoseArmMotion({
        landmarks,
        worldLandmarks,
        side: "left",
        imageOrigin: shoulderImageOrigin,
        worldOrigin: worldOrigins.shoulders,
    });
    const rightArm = createSincroPoseArmMotion({
        landmarks,
        worldLandmarks,
        side: "right",
        imageOrigin: shoulderImageOrigin,
        worldOrigin: worldOrigins.shoulders,
    });

    return {
        snapshot: {
            trackingEnabled: true,
            detected: true,
            confidence: Math.max(shoulderConfidence, leftArm.confidence, rightArm.confidence),
            upperBody: {
                shoulderRoll: clampSigned((rightShoulder.y - leftShoulder.y) / shoulderWidth),
                torsoLean: clampSigned((hipCenterX - shoulderCenterX) / shoulderWidth),
                shoulderWidth,
                shoulderCenterX,
                shoulderCenterY,
                hipCenterTracked,
            },
            leftArm,
            rightArm,
            lowerBodyTargets: createSincroPoseLowerBodyTargets({
                landmarks,
                worldLandmarks,
                imageOrigin: hipsImageOrigin,
                worldOrigin: worldOrigins.hips,
            }),
            inferenceTimeMs,
            inferenceFps,
            consecutiveFailures: 0,
            degradedToFaceOnly: false,
            lastUpdatedAtMs: nowMs,
        },
        consecutiveFailures: 0,
    };
}

type FailedPoseResultOptions = {
    reason: string;
    inferenceTimeMs: number;
    inferenceFps: number;
    nowMs: number;
    consecutiveFailures: number;
};

function createFailedPoseResult({
    reason,
    inferenceTimeMs,
    inferenceFps,
    nowMs,
    consecutiveFailures,
}: FailedPoseResultOptions): NormalizedSincroPoseResult {
    return {
        snapshot: {
            ...createSincroPoseFallbackSnapshot({
                reason,
                nowMs,
                consecutiveFailures,
            }),
            inferenceTimeMs,
            inferenceFps,
        },
        consecutiveFailures,
    };
}
