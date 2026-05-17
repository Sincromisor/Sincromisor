import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { applyArmHandPose } from "./armBoneHandPose";
import { applyArmBoneRotations } from "./armBoneRotationPose";
import { ArmSpeechGestureState, getArmSpeechExpressionProfile } from "./armBoneSpeechGesture";
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from "./CharacterMotionConfig";
import type { CharacterBehaviorSnapshot } from "./characterBehaviorTypes";
import type { SincroPoseRetargetFrame } from "./sincroPoseRetargetTypes";

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

// 腕・手・親指の既定ポーズを作る controller。
// 現状は待機姿勢の固定値 + 微小な揺れで、自然に見える静止ポーズを構成している。
export class ArmBoneController {
    private vrm: VRM;
    private speechGestureState = new ArmSpeechGestureState();

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    // 毎フレーム、腕の基準待機ポーズへ低振幅の idle offset を足して適用する。
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

        applyArmBoneRotations({
            nodes: {
                leftUpperArm: this.getNode("leftUpperArm"),
                rightUpperArm: this.getNode("rightUpperArm"),
                leftLowerArm: this.getNode("leftLowerArm"),
                rightLowerArm: this.getNode("rightLowerArm"),
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
                leftHand: this.getNode("leftHand"),
                leftThumbProximal: this.getNode("leftThumbProximal"),
                rightHand: this.getNode("rightHand"),
                rightThumbProximal: this.getNode("rightThumbProximal"),
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
