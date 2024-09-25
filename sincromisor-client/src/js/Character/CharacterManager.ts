// https://sandbox.babylonjs.com/
import { AbstractMesh, Mesh } from "@babylonjs/core/Meshes";
import { Scene } from "@babylonjs/core/scene";
import { } from "@babylonjs/core/Rendering/outlineRenderer"; // これがないとAbstractMesh.renderOutlineがundefinedになる
import { SceneLoader } from "@babylonjs/core/Loading";
import { Color3 } from "@babylonjs/core/Maths/math";
import { IShadowLight, ShadowGenerator } from "@babylonjs/core/Lights";
import { NodeMaterial } from "@babylonjs/core/Materials/Node";
import { GLTFFileLoader } from "@babylonjs/loaders/glTF";
import { BodyMorph } from "./Morph/BodyMorph";
import { EyeMorph } from "./Morph/EyeMorph";
import { MayuMorph } from "./Morph/MayuMorph";
import { MouseMorph } from "./Morph/MouseMorph";
import { CharacterBone } from "./CharacterBone";
import { StageCamera } from "../Stage/StageCamera";
import { StageLight } from "../Stage/StageLight";
import { TalkManager } from "../RTC/TalkManager";
import { HighlightLayer } from "@babylonjs/core/Layers/highlightLayer";

SceneLoader.RegisterPlugin(new GLTFFileLoader());

interface CharacterMorph {
    body: BodyMorph,
    eye: EyeMorph,
    mayu: MayuMorph,
    mouse: MouseMorph
}

interface CharacterBones {
    root: CharacterBone
}

export class CharacterManager {
    static readonly BASE_PATH = '/characters/';
    scene: Scene;
    light: StageLight;
    camera: StageCamera;
    talk: TalkManager;
    public morph: CharacterMorph;
    public bones: CharacterBones;

    constructor(scene: Scene, light: StageLight, camera: StageCamera, talk: TalkManager) {
        this.scene = scene;
        this.light = light;
        this.camera = camera;
        this.talk = talk;
        this.morph = {
            body: new BodyMorph(),
            eye: new EyeMorph(),
            mayu: new MayuMorph(),
            mouse: new MouseMorph(talk)
        }
        this.bones = {
            root: new CharacterBone()
        }
    }

    static availabilityCheck(onSuccess: () => void, onFailure: () => void) {
        fetch(CharacterManager.BASE_PATH + "gloria.glb", { "method": "HEAD" }).then((res) => {
            if (res.status == 200) {
                onSuccess();
            } else {
                onFailure();
            }
        });
    }

    loadModel() {
        /* 
            Append(rootUrl, sceneFilename?, scene?, onSuccess?, onProgress?, onError?, 
                   pluginExtension?, name?): Nullable<ISceneLoaderPlugin | ISceneLoaderPluginAsync>
        */
        SceneLoader.Append(CharacterManager.BASE_PATH, "gloria.glb", this.scene, (scene) => {
            try {


                //this.meshVisibility(false);
                this.setupMaterial("Dress", CharacterManager.BASE_PATH + "dressMaterial.json", scene.getMeshByName("MarnieDress"));
                this.setupMaterial("Hat", CharacterManager.BASE_PATH + "hatMaterial.json", scene.getMeshByName("Hat"));
                this.setupMaterial("Hair", CharacterManager.BASE_PATH + "hairMaterial.json", scene.getMeshByName("Hair"));
                // 頭
                this.setupMaterial("Head", CharacterManager.BASE_PATH + "headMaterial.json", scene.getMeshByName("Head_primitive0"));
                // 顔
                this.setupMaterial("Face", CharacterManager.BASE_PATH + "faceMaterial.json", scene.getMeshByName("Head_primitive1"));
                // 眉毛
                this.setupMaterial("Mayu", CharacterManager.BASE_PATH + "mayuMaterial.json", scene.getMeshByName("Head_primitive2"));
                // 左目
                this.setupMaterial("Eye.l", CharacterManager.BASE_PATH + "bodyMaterial.json", scene.getMeshByName("Head_primitive3"));
                // 右目
                this.setupMaterial("Eye.r", CharacterManager.BASE_PATH + "bodyMaterial.json", scene.getMeshByName("Head_primitive4"));
                this.setupMaterial("Body", CharacterManager.BASE_PATH + "bodyMaterial.json", scene.getMeshByName("Body"));
                //this.setupTexture(scene);
                // ロード中に中途半端な状態で見えてしまう問題に対する暫定的な対策
                //setTimeout(() => { this.meshVisibility(true) }, 5000);

                //const charBone: CharacterBone = new CharacterBone();
                this.bones.root.setupBone(scene);
                this.morph.body.setupMorph(scene);
                this.morph.eye.setupMorph(scene);
                this.morph.mouse.setupMorph(scene);
                this.morph.mayu.setupMorph(scene);
                this.fixHeadPosition();
                this.setHighlightLayer();
                //this.eyeCameraTracking();
            } catch (e) {
                console.error(e);
            }
        }, () => { console.log('SceneLoader loading...'); }, () => { console.error('SceneLoader failed.'); });
    }

    meshVisibility(visible = true) {
        this.scene.meshes.forEach((mesh) => {
            mesh.setEnabled(visible);
        });
    }

    /* キャラクターがカメラのほうを向くようにする */
    /*
    private eyeCameraTracking() {
        this.scene.registerBeforeRender(() => {
            const cameraDirection = this.camera.camera.getTarget().subtract(this.camera.camera.position).normalize();
            this.bones.root.setEyeTarget(
                (this.camera.camera.beta - Math.PI / 2) / 2,
                -Math.atan2(cameraDirection.x, cameraDirection.z) - this.camera.defaultBeta,
                0
            );
        });
    }
    */

    private setupMaterial(matName: string, matFile: string, mesh: AbstractMesh | null) {
        if (mesh == null) { return };
        mesh.renderingGroupId = 1;
        NodeMaterial.ParseFromFileAsync(matName, matFile, this.scene).then((nMat) => {
            let inputBlock = nMat.getInputBlockByPredicate((b) => b.name === "diffuseCut");
            if (inputBlock) {
                inputBlock.value = 0.21;
            }
            inputBlock = nMat.getInputBlockByPredicate((b) => b.name === "shadowItensity");
            if (inputBlock) {
                inputBlock.value = 0.87;
            }
            inputBlock = nMat.getInputBlockByPredicate((b) => b.name === "rimIntensity");
            if (inputBlock) {
                inputBlock.value = 0.08;
            }
            //mesh.position.y = ;
            //mesh.scaling.scaleInPlace(0.1);
            //mesh.scaling.x = -1;
            //mesh.scaling.y = -1;
            //mesh.scaling.z = -1;
            // ノードマテリアルのテクスチャのUVを更新するサンプル
            //this.scene.registerBeforeRender(() => {
            //nMat.getBlockByName("Texture").texture.uOffset += 0.0001;
            //});
            // 画像を更新したい場合
            //let texture = new BABYLON.Texture(texturePath, this.scene);
            //console.log(nMat.getBlockByName("Texture").texture);
            //nMat.getBlockByName("Texture").texture = texture;


            // メッシュの一部が透明になる問題の対策
            //nMat.backFaceCulling = false;
            mesh.hasVertexAlpha = false;

            // マテリアル
            mesh.material = nMat;

            /*
            const material: StandardMaterial = new StandardMaterial('tamaMaterial', this.scene);
            material.diffuseColor = new Color3(255,0, 255);
            material.ambientColor = new Color3(1, 1, 1);
            material.emissiveColor = new Color3(1, 1, 1);
            mesh.material = material;
            */

            // アウトライン
            //mesh.skeleton.enableBlending(0.01);

            /*
            mesh.renderOutline = true;
            mesh.outlineWidth = 0.0001;
            mesh.outlineColor = Color3.Black();
            */
            //mesh.overlayColor = BABYLON.Color3.Green();
            //mesh.renderOverlay = true;

            // 影
            const shadowGenerator: ShadowGenerator = new ShadowGenerator(512, this.light.characterLight as IShadowLight, true);
            shadowGenerator.getShadowMap()?.renderList?.push(mesh)
            shadowGenerator.setDarkness(0.2);
            shadowGenerator.filter = ShadowGenerator.FILTER_PCSS;

            // shadowGenerator.usePoissonSampling = true;
            //shadowGenerator.useContactHardeningShadow = true;
            // shadowGenerator.usePercentageCloserFiltering = true;

            shadowGenerator.contactHardeningLightSizeUVRatio = 0.05;
            shadowGenerator.bias = 0.014
            mesh.receiveShadows = true;
            //mesh.useVertexColors = false;
            //mesh.useVertexAlpha = false;
            // freezeするとシェイプキーが正常にレンダリングできなくなる
            // nMat.freeze();
        });
    }

    // アウトライン(highlight layer版)
    private setHighlightLayer() {
        const highlightColor = new Color3(200, 200, 200);
        const hl01 = new HighlightLayer('HighlightLayer01', this.scene, { isStroke: true, mainTextureFixedSize: 1024, mainTextureRatio: 0.1, blurHorizontalSize: 0.5, blurVerticalSize: 0.5});
        hl01.innerGlow = false;
        hl01.outerGlow = true;
        this.scene.meshes.forEach((mesh: AbstractMesh) => {
            console.log(mesh);
            hl01.addMesh(mesh as Mesh, highlightColor);
        });
    }

    /* 頭と首の継ぎ目がはっきり見えてしまう問題をごまかす */
    private fixHeadPosition() {
        ["Head_primitive0", "Head_primitive1", "Head_primitive2", "Head_primitive3", "Head_primitive4"].forEach((mName) => {
            let headMesh: AbstractMesh | null = this.scene.getMeshByName(mName);
            if (headMesh == null) { return; };
            let morphTargetManager = headMesh.morphTargetManager;
            if (morphTargetManager == null) { return; };

            headMesh.position.x = 0.00;  // 前後
            headMesh.position.y = 0.00; // 高さ
            headMesh.position.z = -0.00128; // 左右
            //eadMesh.rotation.x = -0.0001;
        });
    }
}
