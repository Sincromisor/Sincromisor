import { DirectionalLight } from "three/src/lights/DirectionalLight.js";

export class VRMLight {
    public readonly light: DirectionalLight;

    constructor() {
        this.light = new DirectionalLight(0xffffff, Math.PI);
        this.light.position.set(0.0, 1.0, 5.0).normalize();
    }
}
