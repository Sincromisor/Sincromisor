import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Object3D } from 'three/src/core/Object3D.js';
import { MathUtils } from 'three/src/math/MathUtils.js';
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from './CharacterMotionConfig';
import { CharacterBehaviorSnapshot } from './CharacterBehaviorState';
import type { SincroPoseRetargetFrame } from './SincroPoseRetargeter';

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

// 腕・手・親指の既定ポーズを作る controller。
// 現状は待機姿勢の固定値 + 微小な揺れで、自然に見える静止ポーズを構成している。
export class ArmBoneController {
    private vrm: VRM;
    private lastSpeechBeatId = 0;
    private speechGestureStartedAtSeconds: number | null = null;
    private speechGestureIntensity = 0;
    private speechGestureSide: -1 | 1 = 1;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    // 毎フレーム、腕の基準待機ポーズへ低振幅の idle offset を足して適用する。
    update(elapsedSeconds: number, snapshot?: CharacterBehaviorSnapshot, pose?: SincroPoseRetargetFrame): void {
        const armSway = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.arms.swayPeriodSeconds, Math.PI / 5);
        const elbowSway = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.arms.elbowPeriodSeconds, Math.PI / 2);
        const wristSway = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.arms.wristPeriodSeconds, Math.PI / 9);
        const poseControlsLeftArm = pose?.leftArm.ikActive ?? false;
        const poseControlsRightArm = pose?.rightArm.ikActive ?? false;
        const poseControlsAnyArm = poseControlsLeftArm || poseControlsRightArm;
        const speechGesture = snapshot && !poseControlsAnyArm ? this.updateSpeechGesture(elapsedSeconds, snapshot) : 0;
        const expression = this.speechExpressionProfile(snapshot?.aiSpeech.expressionCode ?? null);
        const leftGesture = poseControlsLeftArm ? 0 : speechGesture * (this.speechGestureSide < 0 ? 1 : 0.42);
        const rightGesture = poseControlsRightArm ? 0 : speechGesture * (this.speechGestureSide > 0 ? 1 : 0.42);
        const leftIdleScale = poseControlsLeftArm ? 0.22 : 1;
        const rightIdleScale = poseControlsRightArm ? 0.22 : 1;

        this.getNode('leftUpperArm')?.rotation.set(
            MathUtils.degToRad(5)
                - leftGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmLiftRad * expression.liftScale
                + (pose?.leftArm.upperArm.x ?? 0),
            leftGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad * expression.openScale
                + (pose?.leftArm.upperArm.y ?? 0),
            MathUtils.degToRad(-75)
                - armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad * leftIdleScale
                - leftGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad * expression.openScale
                + (pose?.leftArm.upperArm.z ?? 0),
        );
        this.getNode('rightUpperArm')?.rotation.set(
            MathUtils.degToRad(5)
                - rightGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmLiftRad * expression.liftScale
                + (pose?.rightArm.upperArm.x ?? 0),
            -rightGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad * expression.openScale
                + (pose?.rightArm.upperArm.y ?? 0),
            MathUtils.degToRad(75)
                + armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad * rightIdleScale
                + rightGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechUpperArmOpenRad * expression.openScale
                + (pose?.rightArm.upperArm.z ?? 0),
        );
        this.getNode('leftLowerArm')?.rotation.set(
            pose?.leftArm.lowerArm.x ?? 0,
            MathUtils.degToRad(-15)
                - elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad * leftIdleScale
                - leftGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechLowerArmFlexRad * expression.flexScale
                + (pose?.leftArm.lowerArm.y ?? 0),
            MathUtils.degToRad(5) + (pose?.leftArm.lowerArm.z ?? 0),
        );
        this.getNode('rightLowerArm')?.rotation.set(
            pose?.rightArm.lowerArm.x ?? 0,
            MathUtils.degToRad(15)
                + elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad * rightIdleScale
                + rightGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechLowerArmFlexRad * expression.flexScale
                + (pose?.rightArm.lowerArm.y ?? 0),
            MathUtils.degToRad(-5) + (pose?.rightArm.lowerArm.z ?? 0),
        );

        this.updateLeftHand(this.getNode('leftHand'), wristSway * leftIdleScale, leftGesture * expression.wristScale, pose?.leftArm.wrist.z ?? 0);
        this.updateLeftThumb(this.getNode('leftThumbProximal'), wristSway);
        this.updateRightHand(this.getNode('rightHand'), wristSway * rightIdleScale, rightGesture * expression.wristScale, pose?.rightArm.wrist.z ?? 0);
        this.updateRightThumb(this.getNode('rightThumbProximal'), wristSway);
    }

    // 手指は末端まで再帰的に回転を入れて、握り込み気味の形を作る。
    private updateLeftHand(baseBone: Object3D | null, wristSway: number, speechGesture: number, poseWristRoll: number): void {
        if (!baseBone) {
            return;
        }
        baseBone.rotation.set(
            0,
            0,
            -0.2
                - wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.wristSwayRad
                - speechGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechWristRollRad
                + poseWristRoll,
        );
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateLeftHand(childBone, wristSway * 0.35, speechGesture * 0.4, poseWristRoll * 0.25);
        });
    }

    private updateLeftThumb(baseBone: Object3D | null, wristSway: number): void {
        if (!baseBone) {
            return;
        }
        baseBone.rotation.set(0, 0.2 + wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.thumbSwayRad, 0);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateLeftThumb(childBone, wristSway * 0.35);
        });
    }

    private updateRightHand(baseBone: Object3D | null, wristSway: number, speechGesture: number, poseWristRoll: number): void {
        if (!baseBone) {
            return;
        }
        baseBone.rotation.set(
            0,
            0,
            0.2
                + wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.wristSwayRad
                + speechGesture * CHARACTER_IDLE_MOTION_CONFIG.arms.speechWristRollRad
                + poseWristRoll,
        );
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateRightHand(childBone, wristSway * 0.35, speechGesture * 0.4, poseWristRoll * 0.25);
        });
    }

    private updateRightThumb(baseBone: Object3D | null, wristSway: number): void {
        if (!baseBone) {
            return;
        }
        baseBone.rotation.set(0, -0.2 - wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.thumbSwayRad, 0);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateRightThumb(childBone, wristSway * 0.35);
        });
    }

    private getNode(name: VRMHumanBoneName): Object3D | null {
        const node: Object3D | null = this.vrm.humanoid.getNormalizedBoneNode(name);
        return node;
    }

    private updateSpeechGesture(elapsedSeconds: number, snapshot: CharacterBehaviorSnapshot): number {
        if (
            snapshot.motionPolicy.allowAiSpeechGesture
            && snapshot.aiSpeech.isSpeaking
            && snapshot.aiSpeech.beatId !== this.lastSpeechBeatId
            && snapshot.aiSpeech.beatIntensity > 0
        ) {
            this.lastSpeechBeatId = snapshot.aiSpeech.beatId;
            this.speechGestureStartedAtSeconds = elapsedSeconds;
            this.speechGestureSide *= -1;
            const expression = this.speechExpressionProfile(snapshot.aiSpeech.expressionCode);
            const kindScale = snapshot.aiSpeech.beatKind === 'speech_start'
                ? 1
                : snapshot.aiSpeech.beatKind === 'punctuation'
                    ? 0.45
                    : 0.72;
            this.speechGestureIntensity = MathUtils.clamp(
                snapshot.aiSpeech.beatIntensity * expression.intensityScale * kindScale,
                0,
                1,
            );
        }
        if (this.speechGestureStartedAtSeconds == null) {
            return 0;
        }
        const progress = (elapsedSeconds - this.speechGestureStartedAtSeconds)
            / CHARACTER_IDLE_MOTION_CONFIG.arms.speechGestureDurationSeconds;
        if (progress >= 1 || !snapshot.aiSpeech.isSpeaking || !snapshot.motionPolicy.allowAiSpeechGesture) {
            this.speechGestureStartedAtSeconds = null;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.speechGestureIntensity;
    }

    private speechExpressionProfile(expressionCode: number | null): ArmSpeechExpressionProfile {
        switch (expressionCode) {
            case 2:
                return { intensityScale: 0.58, liftScale: 0.45, openScale: 0.34, flexScale: 0.55, wristScale: 0.45 };
            case 3:
                return { intensityScale: 0.74, liftScale: 0.58, openScale: 0.38, flexScale: 0.82, wristScale: 0.55 };
            case 4:
                return { intensityScale: 0.86, liftScale: 0.92, openScale: 1.0, flexScale: 0.78, wristScale: 0.82 };
            case 5:
                return { intensityScale: 0.9, liftScale: 1.0, openScale: 0.86, flexScale: 0.62, wristScale: 1.0 };
            case 1:
                return { intensityScale: 0.48, liftScale: 0.42, openScale: 0.5, flexScale: 0.42, wristScale: 0.56 };
            case 0:
            default:
                return { intensityScale: 0.52, liftScale: 0.55, openScale: 0.52, flexScale: 0.5, wristScale: 0.52 };
        }
    }
}

type ArmSpeechExpressionProfile = {
    intensityScale: number;
    liftScale: number;
    openScale: number;
    flexScale: number;
    wristScale: number;
};
