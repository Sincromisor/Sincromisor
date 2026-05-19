import { type VRM, VRMLoaderPlugin, VRMMetaLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { type GLTF, GLTFLoader, type GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Clock } from "three/src/core/Clock.js";
import type { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { Scene } from "three/src/scenes/Scene.js";
import { frontendLogger } from "../../logging/appLogger";
import { DebugConsoleManager } from "../../UI/DebugConsoleManager";
import type { VRMCamera } from "../VRMScene/VRMCamera";
import { ArmBoneController } from "./ArmBoneController";
import { type CharacterBehaviorSnapshot, CharacterBehaviorState } from "./CharacterBehaviorState";
import type { CharacterMotionTuning } from "./CharacterMotionConfig";
import { CharacterMotionOrchestrator } from "./CharacterMotionOrchestrator";
import { EyeBehaviorController } from "./EyeBehaviorController";
import { FaceEmotionController } from "./FaceEmotionController";
import { FaceMorphController } from "./FaceMorphController";
import { HeadBoneController } from "./HeadBoneController";
import { LegBoneController } from "./LegBoneController";
import { SincroFaceRetargeter } from "./SincroFaceRetargeter";
import type { SincroPoseRetargetConfig } from "./SincroPoseRetargeter";
import { SincroPoseRetargeter } from "./SincroPoseRetargeter";
import { applyInitialUpperBodyFraming } from "./vrmInitialUpperBodyFraming";

export type VRMCharacterManagerOptions = {
    scene: Scene;
    vrmCamera: VRMCamera;
    vrmUrl: string;
    onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | undefined) => void;
    enableInitialUpperBodyFraming?: boolean;
};

// import { MToonMaterialLoaderPlugin } from '@pixiv/three-vrm';
// import { MToonNodeMaterial } from '@pixiv/three-vrm/nodes';

// 指定URLのVRM1.0モデルを読み込み、骨/表情コントローラ更新とシーン配置を担当する。
// scene 側は render loop で update() を呼ぶだけにし、VRM固有処理をここへ閉じ込める。
export class VRMCharacterManager {
    public vrm?: VRM;
    public clock: Clock;
    private scene: Scene;
    private vrmCamera: VRMCamera;
    public headBoneController?: HeadBoneController;
    public armBoneController?: ArmBoneController;
    public legBoneController?: LegBoneController;
    public motionOrchestrator?: CharacterMotionOrchestrator;
    public mouthMorphController?: FaceMorphController;
    public emotionMorphController?: FaceEmotionController;
    public eyeBehaviorController?: EyeBehaviorController;
    public characterPosition: Vector3 = new Vector3(0, 0, 0);
    private defaultPosition: Vector3 = new Vector3(0, 0, 0);
    private rootBone?: Object3D;
    private readonly behaviorState: CharacterBehaviorState;
    private readonly sincroFaceRetargeter = new SincroFaceRetargeter();
    private readonly sincroPoseRetargeter = new SincroPoseRetargeter();
    private latestBehaviorSnapshot?: CharacterBehaviorSnapshot;
    private motionElapsedSeconds = 0;
    // VRMロード完了後、UI層へthumbnailImageを通知するためのフック。
    private readonly onThumbnailLoaded?: (thumbnailImage: HTMLImageElement | undefined) => void;
    private readonly enableInitialUpperBodyFraming: boolean;
    private visible: boolean = true;

    constructor(options: VRMCharacterManagerOptions) {
        this.scene = options.scene;
        this.vrmCamera = options.vrmCamera;
        this.onThumbnailLoaded = options.onThumbnailLoaded;
        this.enableInitialUpperBodyFraming = options.enableInitialUpperBodyFraming ?? false;
        this.behaviorState = CharacterBehaviorState.getManager();
        this.clock = new Clock();
        this.clock.start();
        this.load(options.vrmUrl);
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

        loader.load(
            url,
            (gltf: GLTF) => {
                this.attachLoadedVrm(gltf);
            },
            (progress) => {
                frontendLogger.debug("Loading VRM model.", {
                    percent: 100.0 * (progress.loaded / progress.total),
                });
            },
            (error) => {
                frontendLogger.error("Failed to load VRM model.", { error });
                throw new Error("Failed to load VRM model.");
            },
        );
    }

    private attachLoadedVrm(gltf: GLTF): void {
        this.vrm = gltf.userData.vrm as VRM;
        this.initializeVrmControllers(this.vrm);
        this.optimizeLoadedVrm(gltf);
        this.captureDefaultRootPosition();
        this.scene.add(this.vrm.scene);
        this.vrm.scene.visible = this.visible;
        if (this.enableInitialUpperBodyFraming) {
            applyInitialUpperBodyFraming(this.vrm, this.vrmCamera);
        }
        // サムネイルはVRM1.0のみ対象。未設定時は呼び出し側でフォールバックさせる。
        this.onThumbnailLoaded?.(this.getVRMThumbnailImage());
        this.enableVrmSceneShadows(this.vrm.scene);
    }

    private initializeVrmControllers(vrm: VRM): void {
        // 視線/姿勢/表情の更新責務を個別 controller に分け、update() でまとめて進める。
        this.headBoneController = new HeadBoneController(vrm, this.vrmCamera);
        this.armBoneController = new ArmBoneController(vrm);
        this.armBoneController.update(this.motionElapsedSeconds);
        this.sincroPoseRetargeter.attachVrm(vrm);
        this.legBoneController = new LegBoneController(vrm);
        this.legBoneController.update(this.motionElapsedSeconds);
        this.motionOrchestrator = new CharacterMotionOrchestrator(vrm);
        if (vrm.expressionManager) {
            this.mouthMorphController = new FaceMorphController(vrm.expressionManager);
            this.emotionMorphController = new FaceEmotionController(vrm.expressionManager);
            this.eyeBehaviorController = new EyeBehaviorController(vrm, vrm.expressionManager);
        }
    }

    private optimizeLoadedVrm(gltf: GLTF): void {
        if (!this.vrm) {
            return;
        }
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(this.vrm);
    }

    private captureDefaultRootPosition(): void {
        if (!this.vrm) {
            return;
        }
        // キャラクター全体の配置調整は hips 基準で扱う。
        // Looking Glass / simple-vrm の位置合わせ時もここが基準点になる。
        this.rootBone = this.vrm.humanoid.getNormalizedBoneNode("hips") ?? undefined;
        if (this.rootBone) {
            this.defaultPosition = this.rootBone.position.clone();
        }
    }

    private enableVrmSceneShadows(scene: Object3D): void {
        scene.traverse((obj: Object3D) => {
            obj.castShadow = true;
        });
    }

    private getVRMThumbnailImage(): HTMLImageElement | undefined {
        // VRM0.xはthumbnailImageではなくtexture運用のため、本実装では対象外とする。
        if (!this.vrm || this.vrm.meta.metaVersion !== "1") {
            return undefined;
        }
        return this.vrm.meta.thumbnailImage ?? undefined;
    }

    // 毎フレーム更新:
    // 1) キャラクター対話状態 snapshot 更新
    // 2) ボーン/表情 controller
    // 3) VRM内部 update
    // 4) hips基準の位置オフセット反映
    update(): void {
        const deltaSeconds = this.clock.getDelta();
        this.motionElapsedSeconds += deltaSeconds;
        this.latestBehaviorSnapshot = this.behaviorState.update();
        const sincroFace = this.sincroFaceRetargeter.retarget(
            this.latestBehaviorSnapshot.faceMotion,
            this.latestBehaviorSnapshot.nowMs,
        );
        const sincroPose = this.sincroPoseRetargeter.retarget(
            this.latestBehaviorSnapshot.motionPolicy.allowPoseRetarget
                ? this.latestBehaviorSnapshot.poseMotion
                : {
                      ...this.latestBehaviorSnapshot.poseMotion,
                      detected: false,
                      confidence: 0,
                      degradedToFaceOnly: true,
                      fallbackReason: "pose_retarget_disabled",
                  },
            this.latestBehaviorSnapshot.nowMs,
        );
        DebugConsoleManager.getManager().updateSincroPoseRetargetFrame(sincroPose);
        this.headBoneController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.eyeBehaviorController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.mouthMorphController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.emotionMorphController?.update(this.latestBehaviorSnapshot);
        this.armBoneController?.update(
            this.motionElapsedSeconds,
            this.latestBehaviorSnapshot,
            sincroPose,
        );
        this.legBoneController?.update(this.motionElapsedSeconds);
        this.vrm?.update(deltaSeconds);
        if (this.rootBone) {
            const hipsBasePosition = this.defaultPosition.clone().add(this.characterPosition);
            this.rootBone.position.copy(hipsBasePosition);
            this.motionOrchestrator?.update(
                this.motionElapsedSeconds,
                this.latestBehaviorSnapshot,
                hipsBasePosition,
                sincroPose,
            );
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

    setMotionTuning(tuning: Partial<CharacterMotionTuning>): void {
        this.motionOrchestrator?.setTuning(tuning);
        this.eyeBehaviorController?.setTuning(tuning);
    }

    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.sincroPoseRetargeter.setConfig(config);
    }
}
