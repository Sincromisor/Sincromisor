import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseLowerBodyTargetSnapshot,
} from "./SincroPoseMotionSnapshot";
import {
    averagePoseLandmarkVisibility,
    clamp01,
    clampSigned,
    poseLandmarkAngleAt,
    SINCRO_POSE_LANDMARK,
} from "./sincroPoseLandmarkGeometry";
import {
    createSincroPoseTargetPoint,
    type PoseTargetPointOrigin,
    type PoseWorldTargetOrigin,
    SINCRO_POSE_MIN_LANDMARK_VISIBILITY,
} from "./sincroPoseTargetPoint";

type PoseSide = "left" | "right";

type SincroPoseArmMotionOptions = {
    landmarks: NormalizedLandmark[];
    worldLandmarks: Landmark[] | undefined;
    side: PoseSide;
    imageOrigin: PoseTargetPointOrigin;
    worldOrigin: PoseWorldTargetOrigin | undefined;
};

type SincroPoseLowerBodyTargetOptions = {
    landmarks: NormalizedLandmark[];
    worldLandmarks: Landmark[] | undefined;
    imageOrigin: PoseTargetPointOrigin;
    worldOrigin: PoseWorldTargetOrigin | undefined;
};

type SincroPoseArmTargetsOptions = {
    shoulder: NormalizedLandmark | undefined;
    elbow: NormalizedLandmark | undefined;
    wrist: NormalizedLandmark | undefined;
    worldShoulder: Landmark | undefined;
    worldElbow: Landmark | undefined;
    worldWrist: Landmark | undefined;
    imageOrigin: PoseTargetPointOrigin;
    worldOrigin: PoseWorldTargetOrigin | undefined;
};

// 腕 target は image 座標の低振幅 motion と world 座標 IK target を同じ landmark から生成する。
export function createSincroPoseArmMotion({
    landmarks,
    worldLandmarks,
    side,
    imageOrigin,
    worldOrigin,
}: SincroPoseArmMotionOptions): SincroPoseArmMotionSnapshot {
    const armLandmarks = pickArmLandmarks(landmarks, worldLandmarks, side);
    const confidence = averagePoseLandmarkVisibility([
        armLandmarks.shoulder,
        armLandmarks.elbow,
        armLandmarks.wrist,
    ]);
    const targets = createSincroPoseArmTargets({
        shoulder: armLandmarks.shoulder,
        elbow: armLandmarks.elbow,
        wrist: armLandmarks.wrist,
        worldShoulder: armLandmarks.worldShoulder,
        worldElbow: armLandmarks.worldElbow,
        worldWrist: armLandmarks.worldWrist,
        imageOrigin,
        worldOrigin,
    });
    if (confidence < SINCRO_POSE_MIN_LANDMARK_VISIBILITY) {
        return {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            confidence,
            targets,
        };
    }

    const sideSign = side === "left" ? -1 : 1;
    const elbowAngle = poseLandmarkAngleAt(
        armLandmarks.elbow,
        armLandmarks.shoulder,
        armLandmarks.wrist,
    );
    return {
        tracked: true,
        confidence,
        upperArmLift: clampSigned(
            (armLandmarks.shoulder.y - armLandmarks.elbow.y) / imageOrigin.imageScale,
        ),
        upperArmOpen: clampSigned(
            ((armLandmarks.elbow.x - armLandmarks.shoulder.x) * sideSign) / imageOrigin.imageScale,
        ),
        lowerArmFlex: clamp01(1 - elbowAngle / Math.PI) * 2 - 1,
        wristRaise: clampSigned(
            (armLandmarks.elbow.y - armLandmarks.wrist.y) / imageOrigin.imageScale,
        ),
        targets,
    };
}

function pickArmLandmarks(
    landmarks: NormalizedLandmark[],
    worldLandmarks: Landmark[] | undefined,
    side: "left" | "right",
): {
    shoulder: NormalizedLandmark;
    elbow: NormalizedLandmark;
    wrist: NormalizedLandmark;
    worldShoulder: Landmark | undefined;
    worldElbow: Landmark | undefined;
    worldWrist: Landmark | undefined;
} {
    const indices =
        side === "left"
            ? {
                  shoulder: SINCRO_POSE_LANDMARK.leftShoulder,
                  elbow: SINCRO_POSE_LANDMARK.leftElbow,
                  wrist: SINCRO_POSE_LANDMARK.leftWrist,
              }
            : {
                  shoulder: SINCRO_POSE_LANDMARK.rightShoulder,
                  elbow: SINCRO_POSE_LANDMARK.rightElbow,
                  wrist: SINCRO_POSE_LANDMARK.rightWrist,
              };
    return {
        shoulder: landmarks[indices.shoulder],
        elbow: landmarks[indices.elbow],
        wrist: landmarks[indices.wrist],
        worldShoulder: worldLandmarks?.[indices.shoulder],
        worldElbow: worldLandmarks?.[indices.elbow],
        worldWrist: worldLandmarks?.[indices.wrist],
    };
}

function createSincroPoseArmTargets({
    shoulder,
    elbow,
    wrist,
    worldShoulder,
    worldElbow,
    worldWrist,
    imageOrigin,
    worldOrigin,
}: SincroPoseArmTargetsOptions): SincroPoseArmMotionSnapshot["targets"] {
    return {
        shoulder: createSincroPoseTargetPoint({
            landmark: shoulder,
            worldLandmark: worldShoulder,
            joint: "shoulder",
            imageOrigin,
            worldOrigin,
        }),
        elbow: createSincroPoseTargetPoint({
            landmark: elbow,
            worldLandmark: worldElbow,
            joint: "elbow",
            imageOrigin,
            worldOrigin,
        }),
        wrist: createSincroPoseTargetPoint({
            landmark: wrist,
            worldLandmark: worldWrist,
            joint: "wrist",
            imageOrigin,
            worldOrigin,
        }),
    };
}

export function createSincroPoseLowerBodyTargets({
    landmarks,
    worldLandmarks,
    imageOrigin,
    worldOrigin,
}: SincroPoseLowerBodyTargetOptions): SincroPoseLowerBodyTargetSnapshot {
    return {
        leftHip: createSincroPoseTargetPoint({
            landmark: landmarks[SINCRO_POSE_LANDMARK.leftHip],
            worldLandmark: worldLandmarks?.[SINCRO_POSE_LANDMARK.leftHip],
            joint: "hip",
            imageOrigin,
            worldOrigin,
        }),
        rightHip: createSincroPoseTargetPoint({
            landmark: landmarks[SINCRO_POSE_LANDMARK.rightHip],
            worldLandmark: worldLandmarks?.[SINCRO_POSE_LANDMARK.rightHip],
            joint: "hip",
            imageOrigin,
            worldOrigin,
        }),
        leftKnee: createSincroPoseTargetPoint({
            landmark: landmarks[SINCRO_POSE_LANDMARK.leftKnee],
            worldLandmark: worldLandmarks?.[SINCRO_POSE_LANDMARK.leftKnee],
            joint: "knee",
            imageOrigin,
            worldOrigin,
        }),
        rightKnee: createSincroPoseTargetPoint({
            landmark: landmarks[SINCRO_POSE_LANDMARK.rightKnee],
            worldLandmark: worldLandmarks?.[SINCRO_POSE_LANDMARK.rightKnee],
            joint: "knee",
            imageOrigin,
            worldOrigin,
        }),
        leftAnkle: createSincroPoseTargetPoint({
            landmark: landmarks[SINCRO_POSE_LANDMARK.leftAnkle],
            worldLandmark: worldLandmarks?.[SINCRO_POSE_LANDMARK.leftAnkle],
            joint: "ankle",
            imageOrigin,
            worldOrigin,
        }),
        rightAnkle: createSincroPoseTargetPoint({
            landmark: landmarks[SINCRO_POSE_LANDMARK.rightAnkle],
            worldLandmark: worldLandmarks?.[SINCRO_POSE_LANDMARK.rightAnkle],
            joint: "ankle",
            imageOrigin,
            worldOrigin,
        }),
    };
}
