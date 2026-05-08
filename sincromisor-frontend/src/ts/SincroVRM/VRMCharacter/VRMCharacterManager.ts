import { GLTF, GLTFLoader, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Object3D } from 'three/src/core/Object3D.js';
import { Scene } from 'three/src/scenes/Scene.js';
import { Clock } from 'three/src/core/Clock.js';
import { VRM, VRMLoaderPlugin, VRMMetaLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { HeadBoneController } from './HeadBoneController';
import { ArmBoneController } from './ArmBoneController';
import { LegBoneController } from './LegBoneController';
import { FaceMorphController } from './FaceMorphController';
import { FaceEmotionController } from './FaceEmotionController';
import { CharacterBehaviorSnapshot, CharacterBehaviorState } from './CharacterBehaviorState';
import { VRMCamera } from '../VRMScene/VRMCamera';
import { Vector3 } from 'three/src/math/Vector3.js';
import { Box3 } from 'three/src/math/Box3.js';
// import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm';
// import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes';

// simple-vrm の初期自動フレーミング（骨/ bbox 推定）用の調整値。
// 「どこを見に行くか」「どこまでをフレームに含めるか」を分けて管理する。
const SIMPLE_VRM_AUTO_FRAMING_TARGET = {
    // neck が無いVRMで neck位置を head/chest から推定する比率（0=chest, 1=head）。
    // 顔の基準が低いと感じる場合は 0.04 ずつ増やす（推奨範囲: 0.64 - 0.84）。
    neckFallbackFromChestToHead: 0.72,
    // head ボーンから頭頂を推定する倍率。値を上げると頭頂の推定が高くなり、切れにくいが引きやすい。
    // 前髪/帽子で切れる場合は 0.05 ずつ増やす（推奨範囲: 0.55 - 0.90）。
    estimatedHeadTopFromHeadNeckSpan: 0.65,
    // 胸の少し下までフレームに含める量（head-chest差に対する比率）。
    // 値を増やすと胸元が見えやすくなるが、その分引きやすい。
    // 上半身が狭く見える場合は 0.02 ずつ増やす（推奨範囲: 0.06 - 0.20）。
    bottomOverscanBelowChestRatio: 0.12,
    // ahoge などの突起による bbox 上端の上振れをどこまで許容するか（head-neck差に対する比率）。
    // 値を増やすと頭上の突起をより含める（=引きやすい）。
    // ahogeが切れる場合は 0.05 ずつ増やす。遠すぎる場合は 0.05 ずつ下げる（推奨範囲: 0.20 - 0.70）。
    maxTopOvershootFromHeadTopRatio: 0.45,
    // eyeCenter -> neck の補間率。0 に近いほど目寄り、1 に近いほど首寄り。
    // 顔ターゲットが低い（首寄り）場合は 0.04 ずつ下げる。高い（目より上）場合は 0.04 ずつ上げる（推奨範囲: 0.00 - 0.40）。
    eyeCenterTowardNeckRatio: 0.10,
    // eye ボーンが無いVRMで neck->head から顔ターゲットを作る比率（0=neck, 1=head）。
    // 顔ターゲットが低い場合は 0.04 ずつ増やす（推奨範囲: 0.72 - 0.96）。
    faceAimFallbackFromNeckToHead: 0.88,
} as const;

const SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK = {
    // bbox だけで胸位置を推定する比率（0=足元, 1=頭頂）。
    // 値を上げると胸推定が上がり、構図は顔寄りになる。
    // 顔が低く見える場合は 0.03 ずつ増やす（推奨範囲: 0.50 - 0.68）。
    estimatedChestHeightRatio: 0.58,
    // bbox胸推定より少し下まで含める量（全身高に対する比率）。
    // 値を増やすと胸元を多く含めるぶん少し引きやすい。
    // 胸元が詰まる場合は 0.02 ずつ増やす（推奨範囲: 0.02 - 0.10）。
    chestBottomOverscanRatio: 0.04,
    // bbox フォールバック時の顔ターゲット位置（bottom=0, top=1）。
    // 顔ターゲットが低い場合は 0.04 ずつ増やす。高い場合は 0.04 ずつ下げる（推奨範囲: 0.54 - 0.78）。
    faceAimHeightRatio: 0.66,
} as const;

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
    public emotionMorphController: FaceEmotionController | null = null;
    public characterPosition: Vector3 = new Vector3(0, 0, 0);
    private defaultPosition: Vector3 = new Vector3(0, 0, 0);
    private rootBone: Object3D | null = null;
    private readonly behaviorState: CharacterBehaviorState;
    private latestBehaviorSnapshot: CharacterBehaviorSnapshot | null = null;
    // VRMロード完了後、UI層へthumbnailImageを通知するためのフック。
    private readonly onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | null) => void;
    private readonly enableInitialUpperBodyFraming: boolean;
    private visible: boolean = true;

    constructor(
        scene: Scene,
        vrmCamera: VRMCamera,
        vrmUrl: string,
        onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | null) => void,
        enableInitialUpperBodyFraming: boolean = false,
    ) {
        this.scene = scene;
        this.vrmCamera = vrmCamera;
        this.onThumbnailLoaded = onThumbnailLoaded;
        this.enableInitialUpperBodyFraming = enableInitialUpperBodyFraming;
        this.behaviorState = CharacterBehaviorState.getManager();
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
                    this.emotionMorphController = new FaceEmotionController(this.vrm.expressionManager);
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
                this.vrm.scene.visible = this.visible;
                if (this.enableInitialUpperBodyFraming) {
                    this.applyInitialUpperBodyFraming();
                }
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

    // キャラクター身長差を吸収するため、ロード直後に胸〜頭が収まる初期構図へ合わせる。
    // Humanoid骨を優先し、欠損時はbboxで概算する。
    private applyInitialUpperBodyFraming(): void {
        if (!this.vrm) {
            return;
        }

        this.vrm.scene.updateMatrixWorld(true);
        const bbox = new Box3().setFromObject(this.vrm.scene);

        const headPos = this.getHumanoidBoneWorldPosition('head');
        const neckPos = this.getHumanoidBoneWorldPosition('neck');
        const leftEyePos = this.getHumanoidBoneWorldPosition('leftEye');
        const rightEyePos = this.getHumanoidBoneWorldPosition('rightEye');
        const upperChestPos = this.getHumanoidBoneWorldPosition('upperChest');
        const chestPos = this.getHumanoidBoneWorldPosition('chest');
        const spinePos = this.getHumanoidBoneWorldPosition('spine');

        const chestBasePos = upperChestPos ?? chestPos ?? spinePos;
        if (headPos && chestBasePos) {
            const neckReferencePos = neckPos ?? chestBasePos.clone().lerp(
                headPos,
                SIMPLE_VRM_AUTO_FRAMING_TARGET.neckFallbackFromChestToHead,
            );
            const headToNeck = Math.max(headPos.y - neckReferencePos.y, 0.06);
            // head ボーンは頭の中心寄りになりやすいので、頭頂側の見切れ防止余白を加える。
            const estimatedHeadTopY = headPos.y + headToNeck * SIMPLE_VRM_AUTO_FRAMING_TARGET.estimatedHeadTopFromHeadNeckSpan;
            // 「胸から上」を残しつつ顔寄りの構図にするため、胸の少し下までを下端として扱う。
            const frameBottomY = chestBasePos.y
                - Math.max(headPos.y - chestBasePos.y, 0.2) * SIMPLE_VRM_AUTO_FRAMING_TARGET.bottomOverscanBelowChestRatio;
            // ahoge 等の極端な突起で引きすぎないよう、bbox上端の寄与は head推定からの増分を制限する。
            const maxTopOvershoot = headToNeck * SIMPLE_VRM_AUTO_FRAMING_TARGET.maxTopOvershootFromHeadTopRatio;
            const frameTopY = bbox.isEmpty()
                ? estimatedHeadTopY
                : Math.min(Math.max(estimatedHeadTopY, bbox.max.y), estimatedHeadTopY + maxTopOvershoot);
            // 目ボーンが取れる場合はその中点を優先し、目〜鼻付近を直接ターゲットにする。
            const eyeCenterPos = (leftEyePos && rightEyePos)
                ? leftEyePos.clone().add(rightEyePos).multiplyScalar(0.5)
                : null;
            const faceAimPos = eyeCenterPos
                ? eyeCenterPos.clone().lerp(neckReferencePos, SIMPLE_VRM_AUTO_FRAMING_TARGET.eyeCenterTowardNeckRatio)
                : neckReferencePos.clone().lerp(headPos, SIMPLE_VRM_AUTO_FRAMING_TARGET.faceAimFallbackFromNeckToHead);
            const target = new Vector3(
                faceAimPos.x,
                faceAimPos.y,
                faceAimPos.z,
            );
            this.vrmCamera.frameVerticalRange(target, frameTopY, frameBottomY);
            return;
        }

        // ボーン名が取れないVRM向けフォールバック。bbox上側を優先して胸上構図を作る。
        if (bbox.isEmpty()) {
            return;
        }
        const size = bbox.getSize(new Vector3());
        const center = bbox.getCenter(new Vector3());
        const topY = bbox.max.y;
        const estimatedChestY = bbox.min.y + size.y * SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK.estimatedChestHeightRatio;
        const frameBottomY = estimatedChestY - size.y * SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK.chestBottomOverscanRatio;
        const verticalSpan = Math.max(topY - frameBottomY, 0.3);
        // ボーンが無い場合は bbox 比率で近似。顔中心に寄せるため少し上側を向く。
        const target = new Vector3(
            center.x,
            frameBottomY + verticalSpan * SIMPLE_VRM_AUTO_FRAMING_BBOX_FALLBACK.faceAimHeightRatio,
            center.z,
        );
        this.vrmCamera.frameVerticalRange(target, topY, frameBottomY);
    }

    private getHumanoidBoneWorldPosition(
        boneName: 'head' | 'neck' | 'leftEye' | 'rightEye' | 'upperChest' | 'chest' | 'spine',
    ): Vector3 | null {
        if (!this.vrm) {
            return null;
        }
        const boneNode = this.vrm.humanoid.getNormalizedBoneNode(boneName);
        if (!boneNode) {
            return null;
        }
        return boneNode.getWorldPosition(new Vector3());
    }

    // 毎フレーム更新:
    // 1) キャラクター対話状態 snapshot 更新
    // 2) ボーン/表情 controller
    // 3) VRM内部 update
    // 4) hips基準の位置オフセット反映
    update(): void {
        this.latestBehaviorSnapshot = this.behaviorState.update();
        this.headBoneController?.update();
        this.armBoneController?.update();
        this.legBoneController?.update();
        this.vrm?.update(this.clock.getDelta());
        if (this.rootBone) {
            this.rootBone.position.copy(this.defaultPosition.clone().add(this.characterPosition));
        }
    }

    // 後続の motion controller / デバッグ UI が毎フレームの集約済み入力を読むための口。
    behaviorSnapshot(): CharacterBehaviorSnapshot {
        if (!this.latestBehaviorSnapshot) {
            this.latestBehaviorSnapshot = this.behaviorState.update();
        }
        return this.latestBehaviorSnapshot;
    }

    // 起動後に Character トグルを変更した時の可視状態反映に使う。
    // モデル未ロード時は状態だけ保持し、ロード完了時に反映する。
    setVisible(visible: boolean): void {
        this.visible = visible;
        if (this.vrm) {
            this.vrm.scene.visible = visible;
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
