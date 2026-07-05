import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
    averagePoseLandmarkVisibility,
    clampSigned,
    createSincroPoseWorldTargetOrigins,
    poseLandmarkDistance2d,
    SINCRO_POSE_LANDMARK,
} from "./sincroPoseLandmarkGeometry";
import type { SincroPoseMotionSnapshot } from "./sincroPoseMotionSnapshot";
import { createSincroPoseFallbackSnapshot } from "./sincroPoseMotionSnapshotClone";
import {
    poseLandmarkVisibility,
    SINCRO_POSE_MIN_LANDMARK_VISIBILITY,
} from "./sincroPoseTargetPoint";
import {
    createSincroPoseArmMotion,
    createSincroPoseLowerBodyTargets,
} from "./sincroPoseTrackerTargets";

/**
 * Pose snapshot normalizer が読む MediaPipe Pose result の構造境界。
 *
 * replay では `PoseLandmarkerResult` class instance ではなく、recording serializer が保存した plain object
 * をこの構造型として受ける。normalizer は segmentation mask や `close()` lifecycle を読まないため、ここへ
 * 入力境界を狭めて raw replay と live 推論の正規化経路を共有する。
 */
export type SincroPoseLandmarkerResultInput = {
    landmarks: NormalizedLandmark[][];
    worldLandmarks: Landmark[][];
};

type NormalizeSincroPoseResultOptions = {
    result: SincroPoseLandmarkerResultInput;
    inferenceTimeMs: number;
    inferenceFps: number;
    nowMs: number;
    consecutiveFailures: number;
};

type NormalizedSincroPoseResult = {
    snapshot: SincroPoseMotionSnapshot;
    consecutiveFailures: number;
};

type PoseLandmarkOrigins = {
    shoulderImageOrigin: {
        imageScale: number;
        anchorX: number;
        anchorY: number;
    };
    hipsImageOrigin: {
        imageScale: number;
        anchorX: number;
        anchorY: number;
    };
    worldOrigins: ReturnType<typeof createSincroPoseWorldTargetOrigins>;
    shoulderWidth: number;
    shoulderCenterX: number;
    shoulderCenterY: number;
    hipCenterTracked: boolean;
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

    return createTrackedPoseResult({
        landmarks,
        worldLandmarks,
        shoulderConfidence,
        inferenceTimeMs,
        inferenceFps,
        nowMs,
    });
}

function createTrackedPoseResult(options: {
    landmarks: SincroPoseLandmarkerResultInput["landmarks"][number];
    worldLandmarks: SincroPoseLandmarkerResultInput["worldLandmarks"][number] | undefined;
    shoulderConfidence: number;
    inferenceTimeMs: number;
    inferenceFps: number;
    nowMs: number;
}): NormalizedSincroPoseResult {
    const leftShoulder = options.landmarks[SINCRO_POSE_LANDMARK.leftShoulder];
    const rightShoulder = options.landmarks[SINCRO_POSE_LANDMARK.rightShoulder];
    const leftHip = options.landmarks[SINCRO_POSE_LANDMARK.leftHip];
    const rightHip = options.landmarks[SINCRO_POSE_LANDMARK.rightHip];
    const origins = createPoseLandmarkOrigins({
        leftShoulder,
        rightShoulder,
        leftHip,
        rightHip,
        worldLandmarks: options.worldLandmarks,
    });
    const leftArm = createSincroPoseArmMotion({
        landmarks: options.landmarks,
        worldLandmarks: options.worldLandmarks,
        side: "left",
        imageOrigin: origins.shoulderImageOrigin,
        worldOrigin: origins.worldOrigins.shoulders,
    });
    const rightArm = createSincroPoseArmMotion({
        landmarks: options.landmarks,
        worldLandmarks: options.worldLandmarks,
        side: "right",
        imageOrigin: origins.shoulderImageOrigin,
        worldOrigin: origins.worldOrigins.shoulders,
    });

    return createDetectedPoseResult({
        landmarks: options.landmarks,
        worldLandmarks: options.worldLandmarks,
        leftShoulder,
        rightShoulder,
        shoulderConfidence: options.shoulderConfidence,
        leftArm,
        rightArm,
        origins,
        inferenceTimeMs: options.inferenceTimeMs,
        inferenceFps: options.inferenceFps,
        nowMs: options.nowMs,
    });
}

type DetectedPoseResultOptions = {
    landmarks: SincroPoseLandmarkerResultInput["landmarks"][number];
    worldLandmarks: SincroPoseLandmarkerResultInput["worldLandmarks"][number] | undefined;
    leftShoulder: SincroPoseLandmarkerResultInput["landmarks"][number][number];
    rightShoulder: SincroPoseLandmarkerResultInput["landmarks"][number][number];
    shoulderConfidence: number;
    leftArm: SincroPoseMotionSnapshot["leftArm"];
    rightArm: SincroPoseMotionSnapshot["rightArm"];
    origins: PoseLandmarkOrigins;
    inferenceTimeMs: number;
    inferenceFps: number;
    nowMs: number;
};

function createDetectedPoseResult({
    landmarks,
    worldLandmarks,
    leftShoulder,
    rightShoulder,
    shoulderConfidence,
    leftArm,
    rightArm,
    origins,
    inferenceTimeMs,
    inferenceFps,
    nowMs,
}: DetectedPoseResultOptions): NormalizedSincroPoseResult {
    return {
        snapshot: {
            trackingEnabled: true,
            detected: true,
            confidence: Math.max(shoulderConfidence, leftArm.confidence, rightArm.confidence),
            upperBody: createUpperBodySnapshot({
                leftShoulder,
                rightShoulder,
                origins,
            }),
            leftArm,
            rightArm,
            lowerBodyTargets: createSincroPoseLowerBodyTargets({
                landmarks,
                worldLandmarks,
                imageOrigin: origins.hipsImageOrigin,
                worldOrigin: origins.worldOrigins.hips,
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

function createUpperBodySnapshot({
    leftShoulder,
    rightShoulder,
    origins,
}: Pick<DetectedPoseResultOptions, "leftShoulder" | "rightShoulder" | "origins">) {
    return {
        shoulderRoll: clampSigned((rightShoulder.y - leftShoulder.y) / origins.shoulderWidth),
        torsoLean: clampSigned(
            (origins.hipsImageOrigin.anchorX - origins.shoulderCenterX) / origins.shoulderWidth,
        ),
        shoulderWidth: origins.shoulderWidth,
        shoulderCenterX: origins.shoulderCenterX,
        shoulderCenterY: origins.shoulderCenterY,
        hipCenterTracked: origins.hipCenterTracked,
    };
}

type PoseLandmarkOriginsOptions = {
    leftShoulder: SincroPoseLandmarkerResultInput["landmarks"][number][number];
    rightShoulder: SincroPoseLandmarkerResultInput["landmarks"][number][number];
    leftHip: SincroPoseLandmarkerResultInput["landmarks"][number][number];
    rightHip: SincroPoseLandmarkerResultInput["landmarks"][number][number];
    worldLandmarks: SincroPoseLandmarkerResultInput["worldLandmarks"][number] | undefined;
};

function createPoseLandmarkOrigins({
    leftShoulder,
    rightShoulder,
    leftHip,
    rightHip,
    worldLandmarks,
}: PoseLandmarkOriginsOptions): PoseLandmarkOrigins {
    const shoulderWidth = Math.max(poseLandmarkDistance2d(leftShoulder, rightShoulder), 0.08);
    const shoulderCenterX = (leftShoulder.x + rightShoulder.x) * 0.5;
    const shoulderCenterY = (leftShoulder.y + rightShoulder.y) * 0.5;
    const hipCenterTracked =
        poseLandmarkVisibility(leftHip) >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY &&
        poseLandmarkVisibility(rightHip) >= SINCRO_POSE_MIN_LANDMARK_VISIBILITY;
    const hipCenterX = hipCenterTracked ? (leftHip.x + rightHip.x) * 0.5 : shoulderCenterX;
    const hipCenterY = hipCenterTracked ? (leftHip.y + rightHip.y) * 0.5 : shoulderCenterY;
    return {
        shoulderImageOrigin: {
            imageScale: shoulderWidth,
            anchorX: shoulderCenterX,
            anchorY: shoulderCenterY,
        },
        hipsImageOrigin: {
            imageScale: shoulderWidth,
            anchorX: hipCenterX,
            anchorY: hipCenterY,
        },
        worldOrigins: createSincroPoseWorldTargetOrigins(worldLandmarks),
        shoulderWidth,
        shoulderCenterX,
        shoulderCenterY,
        hipCenterTracked,
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
