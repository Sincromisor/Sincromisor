import { Scene } from '@babylonjs/core/scene';
import { Vector3, Quaternion } from '@babylonjs/core/Maths';
import { Tools } from '@babylonjs/core/Misc';
import { Nullable, float, int } from '@babylonjs/core/types';
import { TransformNode } from "@babylonjs/core/Meshes";
import { CharacterGaze } from '../CharacterGaze/CharacterGaze';

type BoneRotation = {
    "roll": Array<float>,
    "pitch": Array<float>,
    "yaw": Array<float>
}

export class CharacterBone {
    private rotation: BoneRotation;
    private readonly maxSamples: int;
    private readonly neckRotation: Vector3;
    private readonly characterGaze: CharacterGaze;

    constructor() {
        this.characterGaze = CharacterGaze.getManager();
        this.neckRotation = new Vector3(0.0, 0.0, 0.0);
        this.rotation = {
            "roll": [0.0],
            "pitch": [0.0],
            "yaw": [0.0]
        };
        this.maxSamples = 5;
    }

    setEyeTarget(rx: float, ry: float, rz: float) {
        //const beta:float = Tools.ToRadians(-20);
        this.neckRotation.x = (this.neckRotation.x + rx) / 2;
        this.neckRotation.z = rz;
        if (ry > Tools.ToRadians(90) || ry < Tools.ToRadians(-90)) {
            this.neckRotation.y = this.neckRotation.y / 1.1;
        } else if (ry > Tools.ToRadians(45)) {
            this.neckRotation.y = (this.neckRotation.y + Tools.ToRadians(45)) / 2;
        } else if (ry < Tools.ToRadians(-45)) {
            this.neckRotation.y = (this.neckRotation.y + Tools.ToRadians(-45)) / 2;
        } else {
            this.neckRotation.y = ry;
        }
    }

    addRigQueue(roll: number, pitch: number, yaw: number): void {
        this.rotation['roll'].push(roll);
        this.rotation['pitch'].push(pitch);
        this.rotation['yaw'].push(yaw);
        while (this.rotation['roll'].length > this.maxSamples) {
            this.rotation['roll'].shift();
        }
        while (this.rotation['pitch'].length > this.maxSamples) {
            this.rotation['pitch'].shift();
        }
        while (this.rotation['yaw'].length > this.maxSamples) {
            this.rotation['yaw'].shift();
        }
    }

    setupBone(scene: Scene): void {
        const bone: Nullable<TransformNode> | undefined = scene.getBoneByName("rig")?.getTransformNode();
        const neck: Nullable<TransformNode> | undefined = scene.getBoneByName("c_neck.x")?.getTransformNode();
        const head: Nullable<TransformNode> | undefined = scene.getBoneByName("c_head.x")?.getTransformNode();
        //  const spine03:Nullable<TransformNode> | undefined = scene.getBoneByName("c_spine_03.x")?.getTransformNode();
        const freq = 15; // 大きくなればなるほど揺れる頻度が下がる
        /*
        const spine03 = scene.getBoneByName("c_spine_03.x").getTransformNode();
        const spine02 = scene.getBoneByName("c_spine_02.x").getTransformNode();
        const arm = scene.getBoneByName("c_arm_fk.l").getTransformNode();
        const forearm = scene.getBoneByName("c_forearm_fk.l").getTransformNode();
        */
        if (bone) {
            bone.rotation = new Vector3(0, Tools.ToRadians(-90), 0);
            //bone.position = new Vector3(0, -50, 10); // yはFloorの高さに合わせる(50)
            //bone.scaling = new Vector3(35, 35, 35);
        }

        scene.registerBeforeRender(() => {
            // 顔認識結果から目線を計算し設定
            const eyeAngles = this.characterGaze.eyeAngles();
            // 縦方向
            const eyeAngleX = eyeAngles[1] * (Math.PI / 180);
            // 横方向
            const eyeAngleY = -eyeAngles[0] * (Math.PI / 180);
            this.setEyeTarget(eyeAngleX, eyeAngleY, 0);

            //b_form.scaling.set(10, 10, 10);
            // 左右を向く(-3.14 ～ 3.14)
            const roll = this.average(this.rotation["roll"]); //Math.sin((window.performance.now() / freq / 180) * Math.PI) / 5;
            //const pitch = this.average(this.rotation["pitch"]);
            // 左右に揺れる(自動)
            const yaw = Math.sin((window.performance.now() / freq / 180) * Math.PI) / 500;
            const rpyQuaternion = Quaternion.RotationYawPitchRoll(roll / 2, 0, yaw / 4);
            bone?.rotationQuaternion?.set(rpyQuaternion.x, rpyQuaternion.y, rpyQuaternion.z, rpyQuaternion.w);
            //const neckQuaternion = BABYLON.Quaternion.RotationYawPitchRoll(Math.sin((window.performance.now() / freq / 180) * Math.PI), 0, 0);
            /*
            const neckQuaternion = Quaternion.RotationYawPitchRoll(roll / 2, pitch / 2, yaw * 2);
            neck?.rotationQuaternion?.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
            head?.rotationQuaternion?.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
            */
            if (neck && head) {
                neck.rotation = this.neckRotation;
                head.rotation = this.neckRotation;
            }
            //spine03.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
            //spine02.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
            //arm.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);
            //forearm.rotationQuaternion.set(neckQuaternion.x, neckQuaternion.y, neckQuaternion.z, neckQuaternion.w);

            //b_form.rotation.x = Math.sin((window.performance.now() / 180) * Math.PI)*180;
            //bone.setAxisAngle(BABYLON.Axis.Z, Math.sin((window.performance.now() / 180) * Math.PI)*180, BABYLON.Space.WORLD, headMesh);
            //b_form.rotate(BABYLON.Axis.Z, Math.sin((window.performance.now() / 180) * Math.PI)/500, BABYLON.Space.WORLD);
        });
    }

    private average(ary: Array<float>): float {
        return ary.reduce((e, cur) => { return e + cur }) / ary.length;
    }
}
