import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Object3D } from 'three/src/core/Object3D.js';
import { MathUtils } from 'three/src/math/MathUtils.js';
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from './CharacterMotionConfig';

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

// 腕・手・親指の既定ポーズを作る controller。
// 現状は待機姿勢の固定値 + 微小な揺れで、自然に見える静止ポーズを構成している。
export class ArmBoneController {
    private vrm: VRM;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    // 毎フレーム、腕の基準待機ポーズへ低振幅の idle offset を足して適用する。
    update(elapsedSeconds: number): void {
        const armSway = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.arms.swayPeriodSeconds, Math.PI / 5);
        const elbowSway = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.arms.elbowPeriodSeconds, Math.PI / 2);
        const wristSway = sineWave(elapsedSeconds, CHARACTER_IDLE_MOTION_CONFIG.arms.wristPeriodSeconds, Math.PI / 9);

        this.getNode('leftUpperArm')?.rotation.set(
            MathUtils.degToRad(5),
            0,
            MathUtils.degToRad(-75) - armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad,
        );
        this.getNode('rightUpperArm')?.rotation.set(
            MathUtils.degToRad(5),
            0,
            MathUtils.degToRad(75) + armSway * CHARACTER_IDLE_MOTION_CONFIG.arms.upperArmSwayRad,
        );
        this.getNode('leftLowerArm')?.rotation.set(
            0,
            MathUtils.degToRad(-15) - elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad,
            MathUtils.degToRad(5),
        );
        this.getNode('rightLowerArm')?.rotation.set(
            0,
            MathUtils.degToRad(15) + elbowSway * CHARACTER_IDLE_MOTION_CONFIG.arms.lowerArmSwayRad,
            MathUtils.degToRad(-5),
        );

        this.updateLeftHand(this.getNode('leftHand'), wristSway);
        this.updateLeftThumb(this.getNode('leftThumbProximal'), wristSway);
        this.updateRightHand(this.getNode('rightHand'), wristSway);
        this.updateRightThumb(this.getNode('rightThumbProximal'), wristSway);
    }

    // 手指は末端まで再帰的に回転を入れて、握り込み気味の形を作る。
    private updateLeftHand(baseBone: Object3D | null, wristSway: number): void {
        if (!baseBone) {
            return;
        }
        baseBone.rotation.set(0, 0, -0.2 - wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.wristSwayRad);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateLeftHand(childBone, wristSway * 0.35);
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

    private updateRightHand(baseBone: Object3D | null, wristSway: number): void {
        if (!baseBone) {
            return;
        }
        baseBone.rotation.set(0, 0, 0.2 + wristSway * CHARACTER_IDLE_MOTION_CONFIG.arms.wristSwayRad);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateRightHand(childBone, wristSway * 0.35);
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
}
