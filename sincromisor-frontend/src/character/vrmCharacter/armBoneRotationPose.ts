import type { Object3D } from "three/src/core/Object3D.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type {
    SincroPoseRetargetedArm,
    SincroPoseRetargetFrame,
} from "../retargeting/sincroPoseRetargetTypes";
import type { ArmSpeechExpressionProfile } from "./armBoneSpeechGesture";
import { CHARACTER_ARM_REST_POSE, CHARACTER_IDLE_MOTION_CONFIG } from "./characterMotionConfig";

/** 待機姿勢、発話動作、追跡姿勢を直接反映する正規化腕ボーン。 */
export type ArmRotationNodes = {
    leftUpperArm?: Object3D;
    rightUpperArm?: Object3D;
    leftLowerArm?: Object3D;
    rightLowerArm?: Object3D;
};

/**
 * 腕回転の直接書き込み入力。
 *
 * `pose` がない部位は `CHARACTER_ARM_REST_POSE` を基準にし、経過時間から計算済みの待機揺れと
 * 発話動作を加える。値は正規化ボーンのローカル Euler 回転として扱う。
 */
export type ArmRotationPoseInput = {
    nodes: ArmRotationNodes;
    pose?: SincroPoseRetargetFrame;
    armSway: number;
    elbowSway: number;
    leftGesture: number;
    rightGesture: number;
    leftIdleScale: number;
    rightIdleScale: number;
    expression: ArmSpeechExpressionProfile;
};

/**
 * 左右の上腕・前腕へ現在 frame の回転を直接適用する。
 *
 * 有効な 3D IK quaternion を最優先し、それ以外は待機姿勢へ追跡差分と動作差分を加える。
 * 渡されたボーンを変更するが、`setNormalizedPose()` や torso / shoulder は更新しない。
 */
export function applyArmBoneRotations(input: ArmRotationPoseInput): void {
    applyLeftUpperArm(input);
    applyRightUpperArm(input);
    applyLeftLowerArm(input);
    applyRightLowerArm(input);
}

function applyLeftUpperArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, leftGesture, leftIdleScale, expression } = input;
    const rest = CHARACTER_ARM_REST_POSE.left.upperArm;
    if (applyIkQuaternion(nodes.leftUpperArm, pose?.leftArm, "upper")) {
        return;
    }
    nodes.leftUpperArm?.rotation.set(
        rest.x -
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmLiftRad *
                expression.liftScale +
            (pose?.leftArm.upperArm.x ?? 0),
        rest.y +
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
                expression.openScale +
            (pose?.leftArm.upperArm.y ?? 0),
        rest.z -
            input.armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad * leftIdleScale -
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
                expression.openScale +
            (pose?.leftArm.upperArm.z ?? 0),
    );
}

function applyRightUpperArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, rightGesture, rightIdleScale, expression } = input;
    const rest = CHARACTER_ARM_REST_POSE.right.upperArm;
    if (applyIkQuaternion(nodes.rightUpperArm, pose?.rightArm, "upper")) {
        return;
    }
    nodes.rightUpperArm?.rotation.set(
        rest.x -
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmLiftRad *
                expression.liftScale +
            (pose?.rightArm.upperArm.x ?? 0),
        rest.y -
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
                expression.openScale +
            (pose?.rightArm.upperArm.y ?? 0),
        rest.z +
            input.armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad * rightIdleScale +
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
                expression.openScale +
            (pose?.rightArm.upperArm.z ?? 0),
    );
}

function applyLeftLowerArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, leftGesture, leftIdleScale, expression } = input;
    const rest = CHARACTER_ARM_REST_POSE.left.lowerArm;
    if (applyIkQuaternion(nodes.leftLowerArm, pose?.leftArm, "lower")) {
        return;
    }
    nodes.leftLowerArm?.rotation.set(
        rest.x + (pose?.leftArm.lowerArm.x ?? 0),
        rest.y -
            input.elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad * leftIdleScale -
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechLowerArmFlexRad *
                expression.flexScale +
            (pose?.leftArm.lowerArm.y ?? 0),
        rest.z + (pose?.leftArm.lowerArm.z ?? 0),
    );
}

function applyRightLowerArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, rightGesture, rightIdleScale, expression } = input;
    const rest = CHARACTER_ARM_REST_POSE.right.lowerArm;
    if (applyIkQuaternion(nodes.rightLowerArm, pose?.rightArm, "lower")) {
        return;
    }
    nodes.rightLowerArm?.rotation.set(
        rest.x + (pose?.rightArm.lowerArm.x ?? 0),
        rest.y +
            input.elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad * rightIdleScale +
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechLowerArmFlexRad *
                expression.flexScale +
            (pose?.rightArm.lowerArm.y ?? 0),
        rest.z + (pose?.rightArm.lowerArm.z ?? 0),
    );
}

// 3D IK は到達位置を満たすため local quaternion を直接適用する。
function applyIkQuaternion(
    bone: Object3D | undefined,
    arm: SincroPoseRetargetedArm | undefined,
    segment: "upper" | "lower",
): boolean {
    const quaternion = segment === "upper" ? arm?.upperArmQuaternion : arm?.lowerArmQuaternion;
    if (!bone || !isWorldIkArm(arm) || !quaternion) {
        return false;
    }
    bone.quaternion.copy(new Quaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w));
    return true;
}

function isWorldIkArm(arm: SincroPoseRetargetedArm | undefined): boolean {
    return arm?.ikActive === true && arm.ikSolverMode === "world_3d_ik";
}
