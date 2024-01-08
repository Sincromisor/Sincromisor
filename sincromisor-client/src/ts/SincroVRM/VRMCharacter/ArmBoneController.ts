import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Object3D } from 'three/src/core/Object3D.js';
import { MathUtils } from 'three/src/math/MathUtils.js';

/* 
    Humanoid bones: https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

export class ArmBoneController {
    private vrm: VRM;

    constructor(vrm: VRM) {
        this.vrm = vrm;
    }

    update(): void {
        const leftUpperArmNode: Object3D = this.getNode('leftUpperArm');
        const rightUpperArmNode: Object3D = this.getNode('rightUpperArm');
        const leftLowerArmNode: Object3D = this.getNode('leftLowerArm');
        const rightLowerArmNode: Object3D = this.getNode('rightLowerArm');

        leftUpperArmNode.rotation.set(MathUtils.degToRad(5), 0, MathUtils.degToRad(-75))
        rightUpperArmNode.rotation.set(MathUtils.degToRad(5), 0, MathUtils.degToRad(75));
        leftLowerArmNode.rotation.set(0, MathUtils.degToRad(-15), MathUtils.degToRad(5));
        rightLowerArmNode.rotation.set(0, MathUtils.degToRad(15), MathUtils.degToRad(-5));

        this.updateLeftHand(this.getNode('leftHand'));
        this.updateLeftThumb(this.getNode('leftThumbProximal'));
        this.updateRightHand(this.getNode('rightHand'));
        this.updateRightThumb(this.getNode('rightThumbProximal'));
    }

    private updateLeftHand(baseBone: Object3D): void {
        baseBone.rotation.set(0, 0, -0.2);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateLeftHand(childBone);
        });
    }

    private updateLeftThumb(baseBone: Object3D): void {
        baseBone.rotation.set(0, 0.2, 0);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateLeftThumb(childBone);
        });
    }

    private updateRightHand(baseBone: Object3D): void {
        baseBone.rotation.set(0, 0, 0.2);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateRightHand(childBone);
        });
    }

    private updateRightThumb(baseBone: Object3D): void {
        baseBone.rotation.set(0, -0.2, 0);
        baseBone.children.forEach((childBone: Object3D) => {
            this.updateRightThumb(childBone);
        });
    }

    private getNode(name: VRMHumanBoneName): Object3D {
        const node: Object3D | null = this.vrm.humanoid.getNormalizedBoneNode(name);
        if (node === null) {
            throw new Error(`bone ${name} not found`);
        }
        return node;
    }
}
