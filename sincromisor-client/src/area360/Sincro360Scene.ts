import { SincroScene } from "../ts/Scene/SincroScene";
import { Color3, Vector3 } from '@babylonjs/core/Maths';
//import { EnvironmentHelper } from "@babylonjs/core/Helpers/environmentHelper";
import { ScenePerformancePriority } from '@babylonjs/core/scene';
import { Mesh, MeshBuilder } from "@babylonjs/core/Meshes";
import { StandardMaterial } from "@babylonjs/core/Materials";
import { SphereVideo } from "./SphereVideo";
import { StageFloor } from "./StageFloor";
import { StageCamera } from "../ts/Scene/SceneCamera";
import { StageCamera360 } from "./StageCamera360";
// @ts-ignore

// https://docs.lookingglassfactory.com/developer-tools/webxr
export class Sincro360Scene extends SincroScene {
    protected override customizeScene(): void {
        this.scene.performancePriority = ScenePerformancePriority.BackwardCompatible;

        /*
        new EnvironmentHelper({
            //createSkybox: false,
            //createGround: false,
            skyboxSize: 30,
            groundColor: new Color3(0.5, 0.5, 0.5),
        }, this.scene)
        */
        this.createWorldSphere();
        new StageFloor(this.scene);

    }

    protected override setupCamera(): StageCamera {
        return new StageCamera360(this.canvas, this.scene, this.vrMode);
    }

    private createWorldSphere(): void {
        console.log("createWorldSphere[1]");
        const sphere: Mesh = MeshBuilder.CreateSphere('env.WorldSphere', { diameter: 16 }, this.scene);
        const material: StandardMaterial = new StandardMaterial('WorldSphereMaterial', this.scene);
        const sMovie: SphereVideo = new SphereVideo(this.scene, this.light, 'movie');
        material.diffuseTexture = sMovie.videoTexture;
        /* 球の内側をレンダリング */
        material.backFaceCulling = false;
        material.ambientColor = new Color3(1, 1, 1);
        material.emissiveColor = new Color3(1, 1, 1);
        sphere.material = material;
        sphere.position.y = 3; // 0だと南半球が全然見えない
        sphere.scaling.z = -1;
        console.log("createWorldSphere[2]");

        /* カメラ目線をつくる */
        this.scene.registerBeforeRender(() => {
            const target: Vector3 = this.camera.getEyeTarget();
            this.character?.bones.root.setEyeTarget(target.x, target.y, target.z);
        });
    }
}
