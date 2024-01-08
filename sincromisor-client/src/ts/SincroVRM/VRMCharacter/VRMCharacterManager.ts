import { GLTF, GLTFLoader, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { Clock } from 'three/src/core/Clock.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { HeadBoneController } from './HeadBoneController';
import { ArmBoneController } from './ArmBoneController';
import { FaceMorphController } from './FaceMorphController';
import { VRMCamera } from '../VRMScene/VRMCamera';
// import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm';
// import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes';

// 指定したURLからVRM1.0形式のキャラクターを取得し、
// キャラクターの表示、アニメーション、操作を行うクラス
export class VRMCharacterManager {
    public vrm: VRM | null = null;
    public clock: Clock;
    private scene: Scene;
    private vrmCamera: VRMCamera;
    public headBoneController: HeadBoneController | null = null;
    public armBoneController: ArmBoneController | null = null;
    public mouthMorphController: FaceMorphController | null = null;

    constructor(scene: Scene, vrmCamera: VRMCamera, url: string) {
        this.scene = scene;
        this.vrmCamera = vrmCamera;
        this.clock = new Clock();
        this.clock.start();
        this.load(url);
    }

    // VRMキャラクターのload
    private load(url: string): void {
        const loader: GLTFLoader = new GLTFLoader();
        loader.register((parser: GLTFParser) => {
            /*
            const mtoonMaterialPlugin: MToonMaterialLoaderPlugin = new MToonMaterialLoaderPlugin(parser, {
                materialType: MToonNodeMaterial,
            });
            return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });*/
            return new VRMLoaderPlugin(parser);

        });

        loader.load(url,
            (gltf: GLTF) => {
                this.vrm = gltf.userData.vrm as VRM;
                this.headBoneController = new HeadBoneController(this.vrm, this.vrmCamera);
                this.armBoneController = new ArmBoneController(this.vrm);
                this.armBoneController.update();
                if (this.vrm.expressionManager) {
                    this.mouthMorphController = new FaceMorphController(this.vrm.expressionManager);
                }

                VRMUtils.removeUnnecessaryVertices(gltf.scene);
                VRMUtils.combineSkeletons(gltf.scene);
                VRMUtils.combineMorphs(this.vrm);

                this.scene.add(this.vrm.scene);
                //this.setEvent(this.vrm);
            },
            (progress) => {
                console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%');
            },
            (error) => {
                console.error(error);
                throw new Error('Failed to load VRM model.');
            });
    }

    update(): void {
        this.headBoneController?.update();
        this.vrm?.update(this.clock.getDelta());
    }

    /*
    private setEvent(vrm: VRM): void {
        window.addEventListener('mousemove', function (event) {
            const CAMERA_FOV: number = 30.0;
            const CAMERA_Z: number = 6.0;
            const range: number = CAMERA_Z * Math.tan(CAMERA_FOV / 360.0 * Math.PI);
            const px: number = (2.0 * event.clientX - window.innerWidth) / window.innerHeight * range;
            const py: number = - (2.0 * event.clientY - window.innerHeight) / window.innerHeight * range;

            const hipNode: Object3D | null = vrm.humanoid.getNormalizedBoneNode('hips');
            if (hipNode) {
                hipNode.position.set(px, py, 0.0);
                hipNode.rotation.set(MathUtils.degToRad(0), MathUtils.degToRad(0), 0);
            }
        });
    }
    */
}
