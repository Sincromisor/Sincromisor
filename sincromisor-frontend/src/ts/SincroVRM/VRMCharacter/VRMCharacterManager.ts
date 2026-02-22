import { GLTF, GLTFLoader, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Object3D } from 'three/src/core/Object3D.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { Clock } from 'three/src/core/Clock.js';
import { VRM, VRMLoaderPlugin, VRMMetaLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { HeadBoneController } from './HeadBoneController';
import { ArmBoneController } from './ArmBoneController';
import { LegBoneController } from './LegBoneController';
import { FaceMorphController } from './FaceMorphController';
import { VRMCamera } from '../VRMScene/VRMCamera';
import { Vector3 } from 'three/src/math/Vector3.js';
// import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm';
// import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes';

// 指定URLのVRM1.0モデルを読み込み、骨/表情コントローラ更新とシーン配置を担当する。
// scene 側は render loop で update() を呼ぶだけにし、VRM固有処理をここへ閉じ込める。
export class VRMCharacterManager {
    public vrm: VRM | null = null;
    public clock: Clock;
    private scene: Scene;
    private vrmCamera: VRMCamera;
    public headBoneController: HeadBoneController | null = null;
    public armBoneController: ArmBoneController | null = null;
    public legBoneController: LegBoneController | null = null;
    public mouthMorphController: FaceMorphController | null = null;
    public characterPosition: Vector3 = new Vector3(0, 0, 0);
    private defaultPosition: Vector3 = new Vector3(0, 0, 0);
    private rootBone: Object3D | null = null;
    // VRMロード完了後、UI層へthumbnailImageを通知するためのフック。
    private readonly onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | null) => void;

    constructor(scene: Scene, vrmCamera: VRMCamera, vrmUrl: string, onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | null) => void) {
        this.scene = scene;
        this.vrmCamera = vrmCamera;
        this.onThumbnailLoaded = onThumbnailLoaded;
        this.clock = new Clock();
        this.clock.start();
        this.load(vrmUrl);
    }

    // VRMキャラクターの load。
    // ロード完了後に各ボーン/表情 controller を生成し、UI 用サムネイルも callback で返す。
    private load(url: string): void {
        const loader: GLTFLoader = new GLTFLoader();
        loader.register((parser: GLTFParser) => {
            /*
            const mtoonMaterialPlugin: MToonMaterialLoaderPlugin = new MToonMaterialLoaderPlugin(parser, {
                materialType: MToonNodeMaterial,
            });
            return new VRMLoaderPlugin(parser, { mtoonMaterialPlugin });*/
            // three-vrmはデフォルトでmeta.thumbnailImageを読まないため、
            // needThumbnailImageを明示してチャットアイコン用途の画像を取得する。
            return new VRMLoaderPlugin(parser, {
                metaPlugin: new VRMMetaLoaderPlugin(parser, { needThumbnailImage: true }),
            });

        });

        loader.load(url,
            (gltf: GLTF) => {
                this.vrm = gltf.userData.vrm as VRM;
                // 視線/姿勢/表情の更新責務を個別 controller に分け、update() でまとめて進める。
                this.headBoneController = new HeadBoneController(this.vrm, this.vrmCamera);
                this.armBoneController = new ArmBoneController(this.vrm);
                this.armBoneController.update();
                this.legBoneController = new LegBoneController(this.vrm);
                this.legBoneController.update();
                if (this.vrm.expressionManager) {
                    this.mouthMorphController = new FaceMorphController(this.vrm.expressionManager);
                }

                VRMUtils.removeUnnecessaryVertices(gltf.scene);
                VRMUtils.combineSkeletons(gltf.scene);
                VRMUtils.combineMorphs(this.vrm);
                // キャラクター全体の配置調整は hips 基準で扱う。
                // Looking Glass / simple-vrm の位置合わせ時もここが基準点になる。
                this.rootBone = this.vrm?.humanoid.getNormalizedBoneNode('hips');
                if (this.rootBone) {
                    this.defaultPosition = this.rootBone?.position.clone();
                }
                this.scene.add(this.vrm.scene);
                //this.setEvent(this.vrm);
                // サムネイルはVRM1.0のみ対象。未設定時はnullを通知してフォールバックさせる。
                this.onThumbnailLoaded?.(this.getVRMThumbnailImage());

                this.vrm.scene.traverse((obj: Object3D) => {
                    obj.castShadow = true;
                });
            },
            (progress) => {
                console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%');
            },
            (error) => {
                console.error(error);
                throw new Error('Failed to load VRM model.');
            });
    }

    private getVRMThumbnailImage(): HTMLImageElement | null {
        // VRM0.xはthumbnailImageではなくtexture運用のため、本実装では対象外とする。
        if (!this.vrm || this.vrm.meta.metaVersion !== '1') {
            return null;
        }
        return this.vrm.meta.thumbnailImage ?? null;
    }

    // 毎フレーム更新:
    // 1) ボーン/表情 controller
    // 2) VRM内部 update
    // 3) hips基準の位置オフセット反映
    update(): void {
        this.headBoneController?.update();
        this.armBoneController?.update();
        this.legBoneController?.update();
        this.vrm?.update(this.clock.getDelta());
        if (this.rootBone) {
            this.rootBone.position.copy(this.defaultPosition.clone().add(this.characterPosition));
        }
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
