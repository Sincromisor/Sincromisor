import { ArcRotateCamera } from '@babylonjs/core/Cameras';
import { Vector3 } from '@babylonjs/core/Maths';
import { Tools } from '@babylonjs/core/Misc/tools';
import { StageCamera } from '../ts/SincroLegacy/Scene/SceneCamera';

export class StageCamera360 extends StageCamera {
    /*
        Alpha: 水平方向の回転.
        Beta: 垂直方向の回転,
        Radius: 中心からの距離
*/
    protected override readonly defaultAlpha: number = 0.0;
    protected override readonly defaultBeta: number = Math.PI / 2;
    protected override readonly defaultRadius: number = 2.0;
    protected override readonly cameraTarget: Vector3 = new Vector3(0, 1.25, 0);
    protected override cameraDistance: number = 0.75;

    protected override createCamera(): ArcRotateCamera {
        const camera: ArcRotateCamera = new ArcRotateCamera('camera',
            this.defaultAlpha, this.defaultBeta, this.defaultRadius, this.cameraTarget, this.scene);
        //camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
        camera.attachControl(this.canvas, true);
        camera.lowerAlphaLimit = Tools.ToRadians(-180); // 左回転の制御
        camera.upperAlphaLimit = Tools.ToRadians(180); // 右回転の制御
        camera.upperBetaLimit = Tools.ToRadians(135);
        camera.lowerBetaLimit = Tools.ToRadians(0);
        camera.lowerRadiusLimit = 0.3; // キャラクターの中身が見えないところまで
        camera.upperRadiusLimit = 6.0; // 離れすぎないようにする
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

        return camera;
    }
}

/*
this.cameraDistance = 0.75;
this.cameraTarget = new Vector3(0, 1.25, 0);

setupCamera() {
    //const camera = new BABYLON.FreeCamera("camera01", new BABYLON.Vector3(0, 5, 10), this.scene);
    // 第2引数(左右): 0.5 * Math.PI
    // 第3引数(上下): Math.PI / 2
    // 第4引数(距離): 1.5
    this.camera = new ArcRotateCamera("camera01", 0.5 * Math.PI, Math.PI / 2.2, 1.5, this.cameraTarget, this.scene);
    this.camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    this.camera.minZ = 0.001;

    // ctrl + マウスドラッグの慣性をひかえめに
    this.camera.panningInertia = 0.3;
    // ctrl + マウスドラッグの移動距離に制限を掛ける
    // 1.0未満はなぜか微動だにしなくなるので注意
    this.camera.panningDistanceLimit = 1.4;

    this.camera.wheelDeltaPercentage = 0.005; // カメラの拡大・縮小速度
    this.camera.speed = 0.5; // カメラの回転速度
    this.camera.lowerAlphaLimit = -1; // 左回転の制御
    this.camera.upperAlphaLimit = 4; // 右回転の制御
    this.camera.lowerBetaLimit = 0; // 上からは見れるようにする
    this.camera.upperBetaLimit = 2.2; // 下から覗かれないようにする
    this.camera.lowerRadiusLimit = 0.3; // 近づきすぎないようにする
    this.camera.upperRadiusLimit = 5; // 離れすぎないようにする
    this.camera.fov = 0.95;

    //this.camera.setTarget(new BABYLON.Vector3(0, 1.2, 0));
    this.updateCameraDistance();
    this.camera.attachControl(this.canvasID, true);

*/
