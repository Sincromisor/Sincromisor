import { DirectionalLight } from "three/src/lights/DirectionalLight.js";
import { AmbientLight } from "three/src/lights/AmbientLight.js";
import { Vector3 } from "three/src/math/Vector3.js";

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

    setPotision(position: Vector3): void {
        this.posX = (this.posX + position.x) / 2;
        this.posY = (this.posY + position.y) / 2;
        this.posZ = (this.posZ + position.z) / 2;
        this.light.position.set(this.posX, this.posY, this.posZ).normalize();
    }

    setIntensity(intensity: number): void {
        this.intensity = (this.intensity + intensity) / 2;
        this.light.intensity = this.intensity;
    }
}
