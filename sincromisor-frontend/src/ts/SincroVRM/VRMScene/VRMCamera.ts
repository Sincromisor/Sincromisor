import { PerspectiveCamera } from "three/src/cameras/PerspectiveCamera.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// VRM表示用の既定カメラと OrbitControls 設定をまとめるクラス。
// simple-vrm / vrm360 / Looking Glass で「通常閲覧時の視点」を揃える基準になる。
export class VRMCamera {
    public readonly camera: PerspectiveCamera;

    constructor(targetElement: HTMLElement) {
        const CAMERA_FOV = 30.0;
        const CAMERA_Z = 1.2;
        // 顔が見やすい距離・高さを既定にし、細かい差分は scene 側のキャラクター配置で吸収する。
        this.camera = new PerspectiveCamera(CAMERA_FOV, window.innerWidth / window.innerHeight, 0.001, 100.0);
        this.camera.position.set(0.0, 1.45, CAMERA_Z);
        const controls = new OrbitControls( this.camera, targetElement );
        // キャラクターとの距離
        controls.maxDistance = 10;
        controls.minDistance = 0.75;
        // minPolarAngle: キャラクターを上から見下ろす際の角度
        // maxPolarAngle: キャラクターを下から見上げる際の角度
        controls.minPolarAngle = Math.PI * 0.15;
        controls.maxPolarAngle = Math.PI * 0.75;
        controls.screenSpacePanning = true;
        controls.target.set( 0.0, 1.4, 0.0 );
        controls.update();
    }

    // renderer resize に追従して射影行列を更新する。
    updateAspect(ratio: number){
        this.camera.aspect = ratio;
        this.camera.updateProjectionMatrix();
    }
}
