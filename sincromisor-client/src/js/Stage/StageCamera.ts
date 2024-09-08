import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras';
import { Vector3 } from '@babylonjs/core/Maths';
import { Tools } from '@babylonjs/core/Misc/tools';

export class StageCamera {
    canvas: HTMLCanvasElement;
    scene: Scene;
    camera: ArcRotateCamera;
    /*
        Alpha: 水平方向の回転.
        Beta: 垂直方向の回転,
        Radius: 中心からの距離
    */
    defaultAlpha: number = 0.0;//Tools.ToRadians(-90);//0.0;
    defaultBeta: number = Math.PI / 2;
    defaultRadius: number = 80.0;

    constructor(canvas: HTMLCanvasElement, scene: Scene, vrMode: boolean) {
        this.canvas = canvas;
        this.scene = scene;
        if (vrMode) {
            this.camera = this.createVRCamera();
        } else {
            this.camera = this.createCamera();
        }
    }

    private createCamera(): ArcRotateCamera {
        const camera: ArcRotateCamera = new ArcRotateCamera('camera',
            this.defaultAlpha, this.defaultBeta, this.defaultRadius, Vector3.Zero(), this.scene);
        camera.attachControl(this.canvas, true);
        camera.upperBetaLimit = Tools.ToRadians(135);
        camera.lowerBetaLimit = Tools.ToRadians(0);
        camera.lowerRadiusLimit = 30; // キャラクターの中身が見えないところまで
        camera.upperRadiusLimit = 95; // max: 100(Sphereの直径の半分)
        camera.fov = 1.1;
        return camera;
    }

    private createVRCamera(): ArcRotateCamera {
        const scale = 0.015;
        this.defaultAlpha = 3 * Math.PI / 2;
        this.defaultBeta = Math.PI / 50;
        this.defaultRadius = 220 * scale;
        const camera = new ArcRotateCamera("Camera",
            this.defaultAlpha, this.defaultBeta, this.defaultRadius, Vector3.Zero(), this.scene);
        camera.attachControl(this.canvas, true);
        return camera;
    }
}
