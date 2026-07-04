import { type VRM, VRMLoaderPlugin, VRMMetaLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";
import { type GLTF, GLTFLoader, type GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Clock } from "three/src/core/Clock.js";
import type { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { Scene } from "three/src/scenes/Scene.js";
import { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import { frontendLogger } from "../../shared/logging/appLogger";
import {
    type AvatarMotionProfile,
    toMinimalAvatarMotionProfile,
} from "../avatarProfile/avatarMotionProfile";
import {
    type CharacterBehaviorSnapshot,
    CharacterBehaviorState,
} from "../behavior/characterBehaviorState";
import { EyeBehaviorController } from "../behavior/eyeBehaviorController";
import { FaceEmotionController } from "../behavior/faceEmotionController";
import { FaceMorphController } from "../behavior/faceMorphController";
import { HeadBoneController } from "../behavior/headBoneController";
import { SincroFaceRetargeter } from "../retargeting/sincroFaceRetargeter";
import {
    DEFAULT_SINCRO_POSE_RETARGET_CONFIG,
    type SincroPoseRetargetConfig,
    SincroPoseRetargeter,
} from "../retargeting/sincroPoseRetargeter";
import { summarizeComposerDryRun } from "../runtime/sincroMotionObserveOnlyPipelineTypes";
import {
    cloneSincroMotionPipelineState,
    createDefaultSincroMotionPipelineState,
    type SincroMotionPipelineState,
} from "../runtime/sincroMotionPipelineState";
import {
    type SincroVrmPoseComposerDryRunResult,
    SincroVrmPoseComposerDryRunService,
} from "../runtime/sincroVrmPoseComposerDryRun";
import type { VRMCamera } from "../scene/vrmCamera";
import { ArmBoneController } from "./armBoneController";
import type { CharacterMotionTuning } from "./characterMotionConfig";
import { CharacterMotionOrchestrator } from "./characterMotionOrchestrator";
import { LegBoneController } from "./legBoneController";
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

/**
 * 指定 URL の VRM 1.0 モデルを読み込み、骨 / 表情 controller 更新と scene 配置を担当する。
 *
 * caller は render loop から `update()` を呼ぶだけにし、VRM instance、normalized bone node、
 * expression manager、root position の副作用をこの境界へ閉じ込める。composer dry-run は観測と
 * arm application flag の入力に限定し、full `setNormalizedPose()` 適用はこの stage の非対象である。
 */
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
    private readonly composerDryRun = new SincroVrmPoseComposerDryRunService();
    private composerArmApplicationMode =
        DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerArmApplicationMode;
    private sincroMotionPipelineState: SincroMotionPipelineState =
        createDefaultSincroMotionPipelineState();
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
        const loadedVrm: unknown = gltf.userData.vrm;
        if (!isLoadedVrm(loadedVrm)) {
            throw new Error("Loaded GLTF does not contain a VRM instance.");
        }
        this.vrm = loadedVrm;
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
        this.composerDryRun.reset();
        const avatarMotionProfile = this.sincroPoseRetargeter.getAvatarMotionProfile();
        DebugConsoleManager.getManager().updateAvatarMotionProfile(
            avatarMotionProfile ? toMinimalAvatarMotionProfile(avatarMotionProfile) : undefined,
        );
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
    update(nowMs: number = performance.now()): void {
        const deltaSeconds = this.clock.getDelta();
        this.motionElapsedSeconds += deltaSeconds;
        this.latestBehaviorSnapshot = this.behaviorState.update(nowMs);
        const sincroFace = this.sincroFaceRetargeter.retarget(
            this.latestBehaviorSnapshot.faceMotion,
            this.latestBehaviorSnapshot.nowMs,
        );
        const poseMotionForRetarget = this.latestBehaviorSnapshot.motionPolicy.allowPoseRetarget
            ? this.latestBehaviorSnapshot.poseMotion
            : {
                  ...this.latestBehaviorSnapshot.poseMotion,
                  detected: false,
                  confidence: 0,
                  degradedToFaceOnly: true,
                  fallbackReason: "pose_retarget_disabled",
              };
        const sincroPose = this.sincroPoseRetargeter.retarget(
            poseMotionForRetarget,
            this.latestBehaviorSnapshot.nowMs,
        );
        DebugConsoleManager.getManager().updateSincroPoseRetargetFrame(sincroPose);
        const composerDryRun = this.composerDryRun.compose({
            frame: sincroPose,
            profile: this.sincroPoseRetargeter.getAvatarMotionProfile(),
            deltaSeconds,
        });
        this.headBoneController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.eyeBehaviorController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.mouthMorphController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.emotionMorphController?.update(this.latestBehaviorSnapshot);
        const armUpdate = this.armBoneController?.update(
            this.motionElapsedSeconds,
            this.latestBehaviorSnapshot,
            sincroPose,
            {
                mode: this.composerArmApplicationMode,
                composerDryRun,
            },
        );
        const observedComposerDryRun = appendComposerArmApplicationWarnings(
            composerDryRun,
            armUpdate?.composerArmApplicationWarnings ?? [],
        );
        this.sincroMotionPipelineState = cloneSincroMotionPipelineState({
            ...this.sincroMotionPipelineState,
            face: this.latestBehaviorSnapshot.faceMotion,
            pose: poseMotionForRetarget,
            composerDryRun: observedComposerDryRun,
            updatedAtMs: nowMs,
        });
        DebugConsoleManager.getManager().updateSincroComposerDryRunSummary(
            summarizeComposerDryRun(this.sincroMotionPipelineState.composerDryRun),
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

    /**
     * Debug Console などから pose retarget 設定を runtime へ反映する。
     *
     * `composerArmApplicationMode` の切替時だけ production dry-run の previous final pose を reset し、
     * 前 mode の angular velocity clamp 基準を次 frame に持ち越さない。retargeter config は常に転送するが、
     * VRM normalized pose や expression はここでは書き込まない。
     */
    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        const nextComposerArmApplicationMode =
            config.composerArmApplicationMode ?? this.composerArmApplicationMode;
        if (nextComposerArmApplicationMode !== this.composerArmApplicationMode) {
            /*
                feature flag の切替 frame では、前 mode で生成された composer final pose を
                angular velocity clamp の previous として使わない。腕適用自体は毎 frame direct write 後の
                上書きなので残留 state を持たないが、dry-run の previousFinalPose は表示差分に影響する。
            */
            this.composerDryRun.reset();
            this.composerArmApplicationMode = nextComposerArmApplicationMode;
        }
        this.sincroPoseRetargeter.setConfig(config);
    }

    getAvatarMotionProfile(): AvatarMotionProfile | undefined {
        return this.sincroPoseRetargeter.getAvatarMotionProfile();
    }
}

function appendComposerArmApplicationWarnings(
    composerDryRun: SincroVrmPoseComposerDryRunResult,
    warnings: string[],
): SincroVrmPoseComposerDryRunResult {
    /*
        Debug Console は composer dry-run summary を単一の観測口にしている。
        arm application fallback だけ別 channel に分けると rollback 判断が散るため、dry-run service 自体の
        warning 配列に append して同じ summary へ流す。warning が無い frame は object identity を保つ。
    */
    if (warnings.length === 0) {
        return composerDryRun;
    }
    return {
        ...composerDryRun,
        warnings: [...composerDryRun.warnings, ...warnings],
    };
}

function isLoadedVrm(value: unknown): value is VRM {
    return !!value && typeof value === "object" && "scene" in value && "humanoid" in value;
}
