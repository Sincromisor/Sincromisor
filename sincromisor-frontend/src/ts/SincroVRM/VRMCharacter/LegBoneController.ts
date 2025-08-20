import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Object3D } from 'three/src/core/Object3D.js';
import { MathUtils } from 'three/src/math/MathUtils.js';

/*
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

export class LegBoneController {
    private vrm: VRM;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    update(): void {
        const leftUpperFootNode: Object3D = this.getNode('leftUpperLeg');
        const rightUpperFootNode: Object3D = this.getNode('rightUpperLeg');
        const leftLowerFootNode: Object3D = this.getNode('leftLowerLeg');
        const rightLowerFootNode: Object3D = this.getNode('rightLowerLeg');
        const leftFoot:Object3D = this.getNode('leftFoot');
        const rightFoot:Object3D = this.getNode('rightFoot');

        /* 揺れの頻度(Hz) */
        const yure_freq:number = 0.75;
        /* 振幅(1/yure_ampl) */
        const yure_ampl: number = 500;
        /* yure_freq Hzのsin波を作り、-(1/yure_ampl)～(1/yure_ampl)の範囲で揺らす */
        const yure: number = Math.sin(window.performance.now() / 1000 * yure_freq * Math.PI) / yure_ampl;

        leftUpperFootNode.rotation.set(MathUtils.degToRad(-3), MathUtils.degToRad(-5), MathUtils.degToRad(-3));
        leftLowerFootNode.rotation.set(MathUtils.degToRad(6), 0, MathUtils.degToRad(5));

        rightUpperFootNode.rotation.set(MathUtils.degToRad(-4) + yure / 2, MathUtils.degToRad(5), MathUtils.degToRad(2));
        rightLowerFootNode.rotation.set(MathUtils.degToRad(20) + yure, MathUtils.degToRad(5), MathUtils.degToRad(-3));

        /* つま先を10度内側に向ける */
        leftFoot.rotation.set(MathUtils.degToRad(-3), MathUtils.degToRad(-10), 0);
        rightFoot.rotation.set(MathUtils.degToRad(-8) - yure, MathUtils.degToRad(3), 0);
    }

    private getNode(name: VRMHumanBoneName): Object3D {
        const node: Object3D | null = this.vrm.humanoid.getNormalizedBoneNode(name);
        if (node === null) {
            throw new Error(`bone ${name} not found`);
        }
        return node;
    }
}
