import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { Euler, Object3D, Vector3, MathUtils } from 'three';
import { CharacterGaze } from '../../CharacterGaze/CharacterGaze';

/* 
    Humanoid bones
    https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

export class HeadBoneController {
    private position: Vector3 = new Vector3(0, 0, 0);
    private rotation: Euler = new Euler(0, 0, 0);
    private scale: Vector3 = new Vector3(1, 1, 1);
    private vrm: VRM;
    private neckNode: Object3D;
    private characterGaze: CharacterGaze;

    constructor(vrm: VRM) {
        this.vrm = vrm;
        this.neckNode = this.getNode('neck');
        this.characterGaze = CharacterGaze.getManager();
    }

    update(): void {
        const eyeAngles = this.characterGaze.eyeAngles();
        // 縦方向
        const eyeAngleX = eyeAngles[1] * (Math.PI / 180);
        // 横方向
        const eyeAngleY = -eyeAngles[0] * (Math.PI / 180);
        this.setEyeTarget(eyeAngleX, eyeAngleY, 0);

        this.neckNode.position.copy(this.position);
        this.neckNode.rotation.copy(this.rotation);
        this.neckNode.scale.copy(this.scale);
    }

    /* VRMLookAtApplierを用いたほうがいいのでは? */
    private setEyeTarget(rx: number, ry: number, rz: number) {
        //const beta:float = Tools.ToRadians(-20);
        this.rotation.x = (this.rotation.x + rx) / 2;
        this.rotation.z = rz;
        if (ry > MathUtils.degToRad(90) || ry < MathUtils.degToRad(-90)) {
            this.rotation.y = this.rotation.y / 1.1;
        } else if (ry > MathUtils.degToRad(45)) {
            this.rotation.y = (this.rotation.y + MathUtils.degToRad(45)) / 2;
        } else if (ry < MathUtils.degToRad(-45)) {
            this.rotation.y = (this.rotation.y + MathUtils.degToRad(-45)) / 2;
        } else {
            this.rotation.y = ry;
        }
    }

    private getNode(name: VRMHumanBoneName): Object3D {
        const node: Object3D | null = this.vrm.humanoid.getNormalizedBoneNode(name);
        if (node === null) {
            throw new Error(`bone ${name} not found`);
        }
        return node;
    }
}
