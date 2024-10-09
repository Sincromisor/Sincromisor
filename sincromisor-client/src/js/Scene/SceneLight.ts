import { Scene } from '@babylonjs/core/scene';
//import { StandardMaterial } from '@babylonjs/core/Materials';
//import { MeshBuilder, Mesh } from '@babylonjs/core/Meshes';
import { HemisphericLight, PointLight } from '@babylonjs/core/Lights';
import { Vector3, Color3 } from '@babylonjs/core/Maths';

export class StageLight {
    scene: Scene;
    characterLight: PointLight;
    hemisphericLight: HemisphericLight;

    constructor(scene: Scene) {
        this.scene = scene;
        this.hemisphericLight = this.createHemisphericLight();
        this.characterLight = this.createCharacterLight();
        //this.debugLightTama();
    }

    private createHemisphericLight(): HemisphericLight {
        const light = new HemisphericLight('light', new Vector3(0, 1, 0), this.scene);
        light.intensity = 0.1; // ライトの強さ
        light.diffuse = new Color3(1, 1, 1); // 上半分の色（青空）
        light.specular = new Color3(1, 1, 1); // 下半分の色（地面）
        //const additionalLight = new BABYLON.PointLight('pointLight', new BABYLON.Vector3(0, 0, 0), scene);
        //additionalLight.intensity = 30;
        return light
    }

    private createCharacterLight(): PointLight {
        //const light = new BABYLON.HemisphericLight("light01", new BABYLON.Vector3(0, 1, 0), this.scene);
        //light.intensity = 0.7;
        // Vector3(左右, 上下, 前後)
        const light: PointLight = new PointLight("light", new Vector3(2.5, 5, 5), this.scene);

        light.intensity = 0.7;

        light.diffuse = new Color3(1, 1, 0.7);
        // light2.intensity = 1;
        light.shadowMinZ = 0.1;
        light.shadowMaxZ = 1200;
        // light2.shadowMinZ = 0.1;
        // light2.shadowMaxZ = 1200;

        /* 回るライト
        this.scene.registerBeforeRender(() => {
            light.position.x = Math.cos(window.performance.now() / 20000) * 40;
            light.position.z = Math.sin(window.performance.now() / 20000) * 40;
        });
        */

        return light;
    }

    /*
    private debugLightTama(){
        const tama: Mesh = MeshBuilder.CreateSphere('sphere', { diameter: 3 }, this.scene);
        const material: StandardMaterial = new StandardMaterial('tamaMaterial', this.scene);
        material.diffuseColor = new Color3(255,0, 255);
        material.ambientColor = new Color3(1, 1, 1);
        material.emissiveColor = new Color3(1, 1, 1);
        tama.material = material;
        this.scene.registerBeforeRender(()=>{
            tama.position = this.characterLight.position;
        });
    }*/

    setCharacterLightPosition(newVec: Vector3) {
        this.characterLight.position = newVec;
    }

    setCharacterLightIntensity(intensity: number) {
        this.characterLight.intensity = intensity;
    }
}
