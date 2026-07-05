import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { CharacterBehaviorSnapshot } from "../behavior/characterBehaviorTypes";
import type { SincroPoseRetargetFrame } from "../retargeting/sincroPoseRetargetTypes";
import { applyArmHandPose } from "./armBoneHandPose";
import { applyArmBoneRotations } from "./armBoneRotationPose";
import { ArmSpeechGestureState, getArmSpeechExpressionProfile } from "./armBoneSpeechGesture";
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from "./characterMotionConfig";

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

/**
 * 腕・手・親指の既定ポーズを作る controller。
 *
 * この class は direct bone write の旧 controller として残るが、production `VRMCharacterManager.update()`
 * から full composer application の fallback としては呼ばない。ロード直後の初期姿勢や isolated test では
 * 待機姿勢、speech gesture、pose retarget の direct write を行う。`vrm.humanoid.setNormalizedPose()` は呼ばず、
 * torso / shoulder / finger / head / expression も所有しない。
 */
export class ArmBoneController {
    private vrm: VRM;
    private speechGestureState = new ArmSpeechGestureState();

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    /**
     * 毎フレーム、腕の基準待機ポーズへ低振幅の idle offset を足して適用する。
     *
     * この method は production full composer application の unavailable fallback としては呼ばれない。
     * direct write は isolated controller usage とロード直後の初期姿勢に限定し、composer dry-run result は読まない。
     */
    update(
        elapsedSeconds: number,
        snapshot?: CharacterBehaviorSnapshot,
        pose?: SincroPoseRetargetFrame,
    ): void {
        const idleMotion = createIdleArmMotion(elapsedSeconds);
        const poseControlsLeftArm = pose?.leftArm.ikActive ?? false;
        const poseControlsRightArm = pose?.rightArm.ikActive ?? false;
        const poseControlsAnyArm = poseControlsLeftArm || poseControlsRightArm;
        const speechGesture =
            snapshot && !poseControlsAnyArm
                ? this.speechGestureState.update(elapsedSeconds, snapshot)
                : 0;
        const expression = getArmSpeechExpressionProfile(snapshot?.aiSpeech.expressionCode);
        const leftGesture = poseControlsLeftArm
            ? 0
            : speechGesture * (this.speechGestureState.side < 0 ? 1 : 0.42);
        const rightGesture = poseControlsRightArm
            ? 0
            : speechGesture * (this.speechGestureState.side > 0 ? 1 : 0.42);
        const leftIdleScale = poseControlsLeftArm ? 0.22 : 1;
        const rightIdleScale = poseControlsRightArm ? 0.22 : 1;

        const armRotationNodes = {
            leftUpperArm: this.getNode("leftUpperArm"),
            rightUpperArm: this.getNode("rightUpperArm"),
            leftLowerArm: this.getNode("leftLowerArm"),
            rightLowerArm: this.getNode("rightLowerArm"),
        };
        const armHandNodes = {
            leftHand: this.getNode("leftHand"),
            leftThumbProximal: this.getNode("leftThumbProximal"),
            rightHand: this.getNode("rightHand"),
            rightThumbProximal: this.getNode("rightThumbProximal"),
        };

        applyArmBoneRotations({
            nodes: {
                leftUpperArm: armRotationNodes.leftUpperArm,
                rightUpperArm: armRotationNodes.rightUpperArm,
                leftLowerArm: armRotationNodes.leftLowerArm,
                rightLowerArm: armRotationNodes.rightLowerArm,
            },
            pose,
            armSway: idleMotion.armSway,
            elbowSway: idleMotion.elbowSway,
            leftGesture,
            rightGesture,
            leftIdleScale,
            rightIdleScale,
            expression,
        });

        applyArmHandPose({
            nodes: {
                leftHand: armHandNodes.leftHand,
                leftThumbProximal: armHandNodes.leftThumbProximal,
                rightHand: armHandNodes.rightHand,
                rightThumbProximal: armHandNodes.rightThumbProximal,
            },
            pose,
            wristSway: idleMotion.wristSway,
            leftGesture,
            rightGesture,
            leftIdleScale,
            rightIdleScale,
            expression,
        });
    }

    private getNode(name: VRMHumanBoneName): Object3D | undefined {
        return this.vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
    }
}

type IdleArmMotion = {
    armSway: number;
    elbowSway: number;
    wristSway: number;
};

function createIdleArmMotion(elapsedSeconds: number): IdleArmMotion {
    return {
        armSway: sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.arms.swayPeriodSeconds,
            Math.PI / 5,
        ),
        elbowSway: sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.arms.elbowPeriodSeconds,
            Math.PI / 2,
        ),
        wristSway: sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.arms.wristPeriodSeconds,
            Math.PI / 9,
        ),
    };
}
