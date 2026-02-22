import { DirectionalLight } from "three/src/lights/DirectionalLight.js";
import { AmbientLight } from "three/src/lights/AmbientLight.js";
import { Vector3 } from "three/src/math/Vector3.js";

// VRMシーンの基本照明（指向性ライト + 環境光）。
// VRM360Scene では SphereVideo 由来の推定ライトへ毎フレームゆるやかに追従させる。
export class VRMLight {
    public readonly light: DirectionalLight;
    public readonly ambientLight: AmbientLight = new AmbientLight(0xffffff, 1.5);
    public posX: number = 0.0;
    public posY: number = 0.0;
    public posZ: number = 0.0;
    public intensity: number = 1.0;

    constructor() {
        this.light = new DirectionalLight(0xffffff, 1.0);
        this.light.castShadow = true;
        this.light.shadow.mapSize.width = 2048;
        this.light.shadow.mapSize.height = 2048;
        this.light.position.set(0.0, 1.0, 5.0).normalize();
    }

    // 360動画から得たライト位置の急変を抑えるため、移動平均でなめらかに追従する。
    setPotision(position: Vector3): void {
        this.posX = (this.posX + position.x) / 2;
        this.posY = (this.posY + position.y) / 2;
        this.posZ = (this.posZ + position.z) / 2;
        this.light.position.set(this.posX, this.posY, this.posZ).normalize();
    }

    // 照度も同様に平滑化して、フレームごとのチラつきを減らす。
    setIntensity(intensity: number): void {
        this.intensity = (this.intensity + intensity) / 2;
        this.light.intensity = this.intensity;
    }
}
