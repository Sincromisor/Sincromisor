import { Scene } from '@babylonjs/core/scene';
import { Camera, ArcRotateCamera } from '@babylonjs/core/Cameras';
import { Vector3 } from '@babylonjs/core/Maths';
import { Tools } from '@babylonjs/core/Misc/tools';

export class StageCamera {
    protected readonly canvas: HTMLCanvasElement;
    protected readonly scene: Scene;
    protected readonly camera: ArcRotateCamera;
    /*
        Alpha: 水平方向の回転.
        Beta: 垂直方向の回転,
        Radius: 中心からの距離
    */
    protected readonly defaultAlpha: number = 0.0;
    protected readonly defaultBeta: number = Math.PI / 2;
    protected readonly defaultRadius: number = 2.0;
    protected readonly cameraTarget: Vector3 = new Vector3(0, 1.25, 0);
    protected cameraDistance: number = 1.0;

    constructor(canvas: HTMLCanvasElement, scene: Scene, vrMode: boolean) {
        this.canvas = canvas;
        this.scene = scene;
        if (vrMode) {
            this.camera = this.createVRCamera();
        } else {
            this.camera = this.createCamera();
            this.reconfigure();
        }
    }

    /* カメラ目線を作りたい時のターゲット座標を計算 */
    getEyeTarget(): Vector3 {
        const cameraDirection = this.getCameraDirection();
        return new Vector3(
            (this.camera.beta - Math.PI / 2) / 2,
            -Math.atan2(cameraDirection.x, cameraDirection.z) - this.defaultBeta,
            0
        )
    }

    private getCameraDirection(): Vector3 {
        return this.camera.getTarget().subtract(this.camera.position).normalize();
    }

    protected createCamera(): ArcRotateCamera {
        const camera: ArcRotateCamera = new ArcRotateCamera('camera',
            this.defaultAlpha, this.defaultBeta, this.defaultRadius, this.cameraTarget, this.scene);
        camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        camera.attachControl(this.canvas, true);
        camera.lowerAlphaLimit = Tools.ToRadians(-180); // 左回転の制御
        camera.upperAlphaLimit = Tools.ToRadians(180); // 右回転の制御
        camera.upperBetaLimit = Tools.ToRadians(135);
        camera.lowerBetaLimit = Tools.ToRadians(0);
        camera.lowerRadiusLimit = 0.3; // キャラクターの中身が見えないところまで
        camera.upperRadiusLimit = 5.0; // 離れすぎないようにする
        camera.fov = 0.4;
        camera.minZ = 0.001;
        // ctrl + マウスドラッグの慣性をひかえめに
        camera.panningInertia = 0.3;
        // ctrl + マウスドラッグの移動距離に制限を掛ける
        // 1.0未満は微動だにしなくなるので注意
        camera.panningDistanceLimit = 1.4;

        camera.wheelDeltaPercentage = 0.005; // カメラの拡大・縮小速度
        camera.speed = 0.5; // カメラの回転速度

        this.canvas.addEventListener("wheel", (e: WheelEvent) => {
            this.cameraDistance += e.deltaY / 1000;
            if (this.cameraDistance > 5.0) {
                this.cameraDistance = 5.0;
            } else if (this.cameraDistance < 0.3) {
                this.cameraDistance = 0.3;
            }
            this.reconfigure();
        });

        /* 2000msごとにキャンパスサイズを再計算 */
        setInterval(()=>{
            this.reconfigure();
        }, 2000);

        return camera;
    }

    protected createVRCamera(): ArcRotateCamera {
        const scale: number = 0.015;
        const defaultVRAlpha: number = 3 * Math.PI / 2;
        const defaultVRBeta: number = Math.PI / 50;
        const defaultVRRadius: number = 220 * scale;
        const camera: ArcRotateCamera = new ArcRotateCamera("Camera",
            defaultVRAlpha, defaultVRBeta, defaultVRRadius, Vector3.Zero(), this.scene);
        camera.attachControl(this.canvas, true);
        return camera;
    }

    // canvasリサイズ時にORTHOGRAPHIC_CAMERAを再設定
    reconfigure(): void {
        const ratio: number = this.canvas.height / this.canvas.width;
        this.camera.orthoLeft = -this.cameraDistance / 2;
        this.camera.orthoRight = this.cameraDistance / 2;
        this.camera.orthoTop = this.camera.orthoRight * ratio;
        this.camera.orthoBottom = this.camera.orthoLeft * ratio;
    }
}
