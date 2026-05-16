import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { CHARACTER_IDLE_MOTION_CONFIG, sineWave } from "./CharacterMotionConfig";

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

// 脚・足の既定ポーズを作る controller。
// 片足側に小さな揺れを入れて、静止中でも完全固定に見えないようにしている。
export class LegBoneController {
    private vrm: VRM;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    // 毎フレーム、脚の待機姿勢と足先向きを更新する。
    update(elapsedSeconds: number): void {
        const sway = sineWave(
            elapsedSeconds,
            CHARACTER_IDLE_MOTION_CONFIG.legs.swayPeriodSeconds,
            Math.PI / 4,
        );

        this.getNode("leftUpperLeg")?.rotation.set(
            MathUtils.degToRad(-3),
            MathUtils.degToRad(-5),
            MathUtils.degToRad(-3),
        );
        this.getNode("leftLowerLeg")?.rotation.set(MathUtils.degToRad(6), 0, MathUtils.degToRad(5));

        this.getNode("rightUpperLeg")?.rotation.set(
            MathUtils.degToRad(-4) + sway * CHARACTER_IDLE_MOTION_CONFIG.legs.kneeSwayRad * 0.5,
            MathUtils.degToRad(5),
            MathUtils.degToRad(2),
        );
        this.getNode("rightLowerLeg")?.rotation.set(
            MathUtils.degToRad(20) + sway * CHARACTER_IDLE_MOTION_CONFIG.legs.kneeSwayRad,
            MathUtils.degToRad(5),
            MathUtils.degToRad(-3),
        );

        // つま先を内側に向け、右足だけ小さく追従させて重心移動の見え方を弱く補強する。
        this.getNode("leftFoot")?.rotation.set(MathUtils.degToRad(-3), MathUtils.degToRad(-10), 0);
        this.getNode("rightFoot")?.rotation.set(
            MathUtils.degToRad(-8) - sway * CHARACTER_IDLE_MOTION_CONFIG.legs.footSwayRad,
            MathUtils.degToRad(3),
            0,
        );
    }

    private getNode(name: VRMHumanBoneName): Object3D | null {
        const node: Object3D | null = this.vrm.humanoid.getNormalizedBoneNode(name);
        return node;
    }
}
