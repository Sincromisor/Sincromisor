import { VRM, VRMHumanBoneName } from '@pixiv/three-vrm';
import { MathUtils } from 'three/src/math/MathUtils.js';
import { Euler } from 'three/src/math/Euler.js';
import { Vector3 } from 'three/src/math/Vector3.js';
import { Object3D } from 'three/src/core/Object3D.js';
import { CharacterGaze } from '../../CharacterGaze/CharacterGaze';
import { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import { VRMCamera } from '../VRMScene/VRMCamera';

/* 
    Humanoid bones
    https://docs.unity3d.com/ja/2019.4/ScriptReference/HumanBodyBones.html
 */

export class HeadBoneController {
    private position: Vector3 = new Vector3(0, 0, 0);
    private rotation: Euler = new Euler(0, 0, 0);
    private scale: Vector3 = new Vector3(1, 1, 1);
    private vrm: VRM;
    private vrmCamera: VRMCamera;
    private neckNode: Object3D;
    private characterGaze: CharacterGaze;

    constructor(vrm: VRM, vrmCamera: VRMCamera) {
        this.vrm = vrm;
        this.vrmCamera = vrmCamera;
        this.neckNode = this.getNode('neck');
        this.characterGaze = CharacterGaze.getManager();
    }

    update(): void {
        // 顔認識機能の状況を元に、顔認識モードと、カメラの方向を向くモードを切り替える
        if (this.characterGaze.modelIsLoaded()) {
            const eyeAngles = this.characterGaze.eyeAngles();
            // 縦方向
            const eyeAngleX = eyeAngles[1] * (Math.PI / 180);
            // 横方向
            const eyeAngleY = -eyeAngles[0] * (Math.PI / 180);
            this.setEyeTarget(eyeAngleX, eyeAngleY, 0);
        } else {
            // カメラの方向を向くモード
            this.setEyeToCamera(this.vrmCamera.camera);
        }
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

    // カメラの方向を向く
    private setEyeToCamera(camera: PerspectiveCamera): void {
        // neckNode のワールド座標を取得してカメラとの方向ベクトルを求める
        const neckWorldPos = this.neckNode.getWorldPosition(new Vector3());
        const cameraDirection = camera.position.clone().sub(neckWorldPos).normalize();

        // X軸、Y軸の回転角度を計算し、setEyeTarget に反映
        const angleX = -Math.atan2(cameraDirection.y, Math.sqrt(cameraDirection.x * cameraDirection.x + cameraDirection.z * cameraDirection.z));
        const angleY = Math.atan2(cameraDirection.x, cameraDirection.z);
        // そのままだと首の上下方向の動きが激しすぎるので、1/2にしておく
        this.setEyeTarget(angleX / 2, angleY, 0);
    }

    private getNode(name: VRMHumanBoneName): Object3D {
        const node: Object3D | null = this.vrm.humanoid.getNormalizedBoneNode(name);
        if (node === null) {
            throw new Error(`bone ${name} not found`);
        }
        return node;
    }
}
