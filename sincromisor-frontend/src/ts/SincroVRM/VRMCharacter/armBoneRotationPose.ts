import type { Object3D } from "three/src/core/Object3D.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { ArmSpeechExpressionProfile } from "./armBoneSpeechGesture";
import { CHARACTER_IDLE_MOTION_CONFIG } from "./CharacterMotionConfig";
import type { SincroPoseRetargetedArm, SincroPoseRetargetFrame } from "./sincroPoseRetargetTypes";

export type ArmRotationNodes = {
    leftUpperArm?: Object3D;
    rightUpperArm?: Object3D;
    leftLowerArm?: Object3D;
    rightLowerArm?: Object3D;
};

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

export function applyArmBoneRotations(input: ArmRotationPoseInput): void {
    applyLeftUpperArm(input);
    applyRightUpperArm(input);
    applyLeftLowerArm(input);
    applyRightLowerArm(input);
}

function applyLeftUpperArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, leftGesture, leftIdleScale, expression } = input;
    if (applyIkQuaternion(nodes.leftUpperArm, pose?.leftArm, "upper")) {
        return;
    }
    nodes.leftUpperArm?.rotation.set(
        MathUtils.degToRad(5) -
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmLiftRad *
                expression.liftScale +
            (pose?.leftArm.upperArm.x ?? 0),
        leftGesture *
            CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
            expression.openScale +
            (pose?.leftArm.upperArm.y ?? 0),
        MathUtils.degToRad(-75) -
            input.armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad * leftIdleScale -
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
                expression.openScale +
            (pose?.leftArm.upperArm.z ?? 0),
    );
}

function applyRightUpperArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, rightGesture, rightIdleScale, expression } = input;
    if (applyIkQuaternion(nodes.rightUpperArm, pose?.rightArm, "upper")) {
        return;
    }
    nodes.rightUpperArm?.rotation.set(
        MathUtils.degToRad(5) -
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmLiftRad *
                expression.liftScale +
            (pose?.rightArm.upperArm.x ?? 0),
        -rightGesture *
            CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
            expression.openScale +
            (pose?.rightArm.upperArm.y ?? 0),
        MathUtils.degToRad(75) +
            input.armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad * rightIdleScale +
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad *
                expression.openScale +
            (pose?.rightArm.upperArm.z ?? 0),
    );
}

function applyLeftLowerArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, leftGesture, leftIdleScale, expression } = input;
    if (applyIkQuaternion(nodes.leftLowerArm, pose?.leftArm, "lower")) {
        return;
    }
    nodes.leftLowerArm?.rotation.set(
        pose?.leftArm.lowerArm.x ?? 0,
        MathUtils.degToRad(-15) -
            input.elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad * leftIdleScale -
            leftGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechLowerArmFlexRad *
                expression.flexScale +
            (pose?.leftArm.lowerArm.y ?? 0),
        MathUtils.degToRad(5) + (pose?.leftArm.lowerArm.z ?? 0),
    );
}

function applyRightLowerArm(input: ArmRotationPoseInput): void {
    const { nodes, pose, rightGesture, rightIdleScale, expression } = input;
    if (applyIkQuaternion(nodes.rightLowerArm, pose?.rightArm, "lower")) {
        return;
    }
    nodes.rightLowerArm?.rotation.set(
        pose?.rightArm.lowerArm.x ?? 0,
        MathUtils.degToRad(15) +
            input.elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad * rightIdleScale +
            rightGesture *
                CHARACTER_IDLE_MOTION_CONFIG.arms.speechLowerArmFlexRad *
                expression.flexScale +
            (pose?.rightArm.lowerArm.y ?? 0),
        MathUtils.degToRad(-5) + (pose?.rightArm.lowerArm.z ?? 0),
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
