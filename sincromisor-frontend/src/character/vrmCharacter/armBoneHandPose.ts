import type { Object3D } from "three/src/core/Object3D.js";
import type { SincroPoseRetargetFrame } from "../retargeting/sincroPoseRetargetTypes";
import type { ArmSpeechExpressionProfile } from "./armBoneSpeechGesture";
import { CHARACTER_IDLE_MOTION_CONFIG } from "./characterMotionConfig";

export type ArmHandPoseNodes = {
    leftHand?: Object3D;
    leftThumbProximal?: Object3D;
    rightHand?: Object3D;
    rightThumbProximal?: Object3D;
};

export type ArmHandPoseInput = {
    nodes: ArmHandPoseNodes;
    pose?: SincroPoseRetargetFrame;
    wristSway: number;
    leftGesture: number;
    rightGesture: number;
    leftIdleScale: number;
    rightIdleScale: number;
    expression: ArmSpeechExpressionProfile;
};

export function applyArmHandPose(input: ArmHandPoseInput): void {
    const { nodes, pose, wristSway, leftGesture, rightGesture, expression } = input;
    updateLeftHand(
        nodes.leftHand,
        wristSway * input.leftIdleScale,
        leftGesture * expression.wristScale,
        pose?.leftArm.wrist.z ?? 0,
    );
    updateLeftThumb(nodes.leftThumbProximal, wristSway);
    updateRightHand(
        nodes.rightHand,
        wristSway * input.rightIdleScale,
        rightGesture * expression.wristScale,
        pose?.rightArm.wrist.z ?? 0,
    );
    updateRightThumb(nodes.rightThumbProximal, wristSway);
}

// 手指は末端まで再帰的に回転を入れて、握り込み気味の形を作る。
function updateLeftHand(
    baseBone: Object3D | undefined,
    wristSway: number,
    speechGesture: number,
    poseWristRoll: number,
): void {
    if (!baseBone) {
        return;
    }
    baseBone.rotation.set(
        0,
        0,
        -0.2 -
            wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.wristSwayRad -
            speechGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechWristRollRad +
            poseWristRoll,
    );
    baseBone.children.forEach((childBone: Object3D) => {
        updateLeftHand(childBone, wristSway * 0.35, speechGesture * 0.4, poseWristRoll * 0.25);
    });
}

function updateLeftThumb(baseBone: Object3D | undefined, wristSway: number): void {
    if (!baseBone) {
        return;
    }
    baseBone.rotation.set(0, 0.2 + wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.thumbSwayRad, 0);
    baseBone.children.forEach((childBone: Object3D) => {
        updateLeftThumb(childBone, wristSway * 0.35);
    });
}

function updateRightHand(
    baseBone: Object3D | undefined,
    wristSway: number,
    speechGesture: number,
    poseWristRoll: number,
): void {
    if (!baseBone) {
        return;
    }
    baseBone.rotation.set(
        0,
        0,
        0.2 +
            wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.wristSwayRad +
            speechGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechWristRollRad +
            poseWristRoll,
    );
    baseBone.children.forEach((childBone: Object3D) => {
        updateRightHand(childBone, wristSway * 0.35, speechGesture * 0.4, poseWristRoll * 0.25);
    });
}

function updateRightThumb(baseBone: Object3D | undefined, wristSway: number): void {
    if (!baseBone) {
        return;
    }
    baseBone.rotation.set(0, -0.2 - wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.thumbSwayRad, 0);
    baseBone.children.forEach((childBone: Object3D) => {
        updateRightThumb(childBone, wristSway * 0.35);
    });
}
