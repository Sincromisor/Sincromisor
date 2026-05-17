import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "../FaceTracking/SincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseLowerBodyTargetSnapshot,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../FaceTracking/SincroPoseMotionSnapshot";
import type { SincroArmIkConstraintSnapshot } from "../SincroVRM/VRMCharacter/sincroArmIkConstraint";

export function cloneSincroFaceMotionSnapshot(
    snapshot: SincroFaceMotionSnapshot,
): SincroFaceMotionSnapshot {
    return {
        ...snapshot,
        headPose: { ...snapshot.headPose },
        blendshapes: { ...snapshot.blendshapes },
    };
}

export function createDefaultFaceMotionSnapshot(): SincroFaceMotionSnapshot {
    return cloneSincroFaceMotionSnapshot(DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT);
}

export function cloneSincroPoseMotionSnapshot(
    snapshot: SincroPoseMotionSnapshot,
): SincroPoseMotionSnapshot {
    return {
        ...snapshot,
        upperBody: { ...snapshot.upperBody },
        leftArm: clonePoseArmMotion(snapshot.leftArm),
        rightArm: clonePoseArmMotion(snapshot.rightArm),
        lowerBodyTargets: cloneLowerBodyTargets(snapshot.lowerBodyTargets),
    };
}

export function createDefaultPoseMotionSnapshot(): SincroPoseMotionSnapshot {
    return cloneSincroPoseMotionSnapshot({
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        leftArm: DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
        rightArm: DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
        lowerBodyTargets: DEFAULT_SINCRO_POSE_LOWER_BODY_TARGET_SNAPSHOT,
    });
}

export function createNeutralArmIkConstraint(): SincroArmIkConstraintSnapshot {
    return {
        reasons: [],
        jointLimited: false,
        poleStabilized: false,
        collisionAvoided: false,
        weightScale: 1,
        targetPushDistance: 0,
    };
}

function clonePoseArmMotion(snapshot: SincroPoseArmMotionSnapshot): SincroPoseArmMotionSnapshot {
    return {
        ...snapshot,
        targets: {
            shoulder: cloneTargetPoint(snapshot.targets.shoulder),
            elbow: cloneTargetPoint(snapshot.targets.elbow),
            wrist: cloneTargetPoint(snapshot.targets.wrist),
        },
    };
}

function cloneLowerBodyTargets(
    snapshot: SincroPoseLowerBodyTargetSnapshot,
): SincroPoseLowerBodyTargetSnapshot {
    return {
        leftHip: cloneTargetPoint(snapshot.leftHip),
        rightHip: cloneTargetPoint(snapshot.rightHip),
        leftKnee: cloneTargetPoint(snapshot.leftKnee),
        rightKnee: cloneTargetPoint(snapshot.rightKnee),
        leftAnkle: cloneTargetPoint(snapshot.leftAnkle),
        rightAnkle: cloneTargetPoint(snapshot.rightAnkle),
    };
}

function cloneTargetPoint(snapshot: SincroPoseTargetPointSnapshot): SincroPoseTargetPointSnapshot {
    return {
        ...snapshot,
        world: { ...snapshot.world },
    };
}
