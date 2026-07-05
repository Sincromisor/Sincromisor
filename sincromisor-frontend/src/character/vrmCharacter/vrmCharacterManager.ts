import {
    type VRM,
    type VRMHumanBoneName,
    VRMLoaderPlugin,
    VRMMetaLoaderPlugin,
    type VRMPose,
    VRMUtils,
} from "@pixiv/three-vrm";
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
import type { VrmNormalizedLocalPose, VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";
import { ArmBoneController } from "./armBoneController";
import type { CharacterMotionTuning } from "./characterMotionConfig";
import { CharacterMotionOrchestrator } from "./characterMotionOrchestrator";
import { LegBoneController } from "./legBoneController";
import { applyInitialUpperBodyFraming } from "./vrmInitialUpperBodyFraming";

const FULL_NORMALIZED_POSE_APPLICATION_BONES: readonly VRMHumanBoneName[] = [
    "spine",
    "chest",
    "upperChest",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
    "leftThumbMetacarpal",
    "leftThumbProximal",
    "leftThumbDistal",
    "leftIndexProximal",
    "leftIndexIntermediate",
    "leftIndexDistal",
    "leftMiddleProximal",
    "leftMiddleIntermediate",
    "leftMiddleDistal",
    "leftRingProximal",
    "leftRingIntermediate",
    "leftRingDistal",
    "leftLittleProximal",
    "leftLittleIntermediate",
    "leftLittleDistal",
    "rightThumbMetacarpal",
    "rightThumbProximal",
    "rightThumbDistal",
    "rightIndexProximal",
    "rightIndexIntermediate",
    "rightIndexDistal",
    "rightMiddleProximal",
    "rightMiddleIntermediate",
    "rightMiddleDistal",
    "rightRingProximal",
    "rightRingIntermediate",
    "rightRingDistal",
    "rightLittleProximal",
    "rightLittleIntermediate",
    "rightLittleDistal",
];

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
 * expression manager、root position の副作用をこの境界へ閉じ込める。full normalized pose application は
 * dry-run が同一 frame の available result を返す場合だけここで 1 回実行する。失敗時は unavailable reason を
 * Debug Console に残すだけで、旧 arm / torso staged writer は production fallback として呼ばない。
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
    private composerSemanticFingerApplicationMode =
        DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerSemanticFingerApplicationMode;
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
        const avatarMotionProfile = this.sincroPoseRetargeter.getAvatarMotionProfile();
        const minimalAvatarMotionProfile = avatarMotionProfile
            ? toMinimalAvatarMotionProfile(avatarMotionProfile)
            : undefined;
        const sincroPose = this.sincroPoseRetargeter.retarget(
            poseMotionForRetarget,
            this.latestBehaviorSnapshot.nowMs,
            {
                temporal: this.latestBehaviorSnapshot.sincroMotionPipeline?.temporal,
                profile: minimalAvatarMotionProfile,
            },
        );
        DebugConsoleManager.getManager().updateSincroPoseRetargetFrame(sincroPose);
        const composerDryRun = this.composerDryRun.compose({
            frame: sincroPose,
            profile: avatarMotionProfile,
            semanticFinger: {
                mode: this.composerSemanticFingerApplicationMode,
                intent: this.latestBehaviorSnapshot.sincroMotionPipeline?.intent,
                hand: this.latestBehaviorSnapshot.sincroMotionPipeline?.hand,
            },
            deltaSeconds,
        });
        this.headBoneController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.eyeBehaviorController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.mouthMorphController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.emotionMorphController?.update(this.latestBehaviorSnapshot);
        const fullApplication = applyFullNormalizedPoseApplication(this.vrm, composerDryRun);
        const observedComposerDryRun = annotateFullNormalizedPoseApplication(
            appendComposerApplicationWarnings(composerDryRun, fullApplication.warnings),
            fullApplication,
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
        DebugConsoleManager.getManager().updateSincroComposerDryRunResult(observedComposerDryRun);
        this.legBoneController?.update(this.motionElapsedSeconds);
        this.vrm?.update(deltaSeconds);
        if (this.rootBone) {
            const hipsBasePosition = this.defaultPosition.clone().add(this.characterPosition);
            this.rootBone.position.copy(hipsBasePosition);
            this.motionOrchestrator?.updateRootStabilization(hipsBasePosition);
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
     * semantic / finger rollback flag の切替時だけ production dry-run の previous final pose を reset し、
     * 前 mode の angular velocity clamp 基準や finger previous hold を次 frame に持ち越さない。arm、
     * torso / shoulder、full normalized pose application の staged rollback flags は削除済みである。
     * retargeter config は常に転送するが、VRM normalized pose や expression はここでは書き込まない。
     */
    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        const nextComposerSemanticFingerApplicationMode =
            config.composerSemanticFingerApplicationMode ??
            this.composerSemanticFingerApplicationMode;
        if (
            nextComposerSemanticFingerApplicationMode !== this.composerSemanticFingerApplicationMode
        ) {
            /*
                semantic / finger layer の有効/無効を切り替える frame では、前 mode で生成された
                composer final pose を angular velocity clamp の previous として使わず、finger previous hold も
                破棄する。full application 自体は常時 production path のため、ここで別 mode state は持たない。
            */
            this.composerDryRun.reset();
            this.composerSemanticFingerApplicationMode = nextComposerSemanticFingerApplicationMode;
        }
        this.sincroPoseRetargeter.setConfig(config);
    }

    getAvatarMotionProfile(): AvatarMotionProfile | undefined {
        return this.sincroPoseRetargeter.getAvatarMotionProfile();
    }
}

/**
 * full normalized pose application 1 frame 分の結果。
 *
 * `applied=true` は VRM が composer-owned upper-body pose を受け取ったことを表す。`applied=false` は
 * current frame に適用可能な full finalPose が無かったことを表し、旧 arm / torso staged writer の起動条件には
 * しない。失敗条件は VRM 未ロード、dry-run 非 available、available frame の result 欠損に限定する。
 */
export type FullNormalizedPoseApplicationResult = {
    applied: boolean;
    /**
     * current frame の full application が使えない理由。Debug Console summary / metrics 用の観測値であり、
     * staged fallback path を起動する trigger として使わない。
     */
    unavailableReason?: string;
    /**
     * Debug Console composer summary に合流する warning code。full application が使えない理由だけを追加し、
     * semantic / finger suppression warning は dry-run service 側のまま残す。
     */
    warnings: string[];
};

/**
 * upper body composer finalPose を VRM humanoid へ 1 frame 1 回だけ適用する production writer。
 *
 * caller はこの helper の成否に関わらず arm / torso / shoulder の direct write を fallback として呼ばない。
 * `status !== "available"`、result 欠損、VRM 未ロードでは stale finalPose を再利用せず、unavailable reason と
 * warning だけを返す。head / neck / leg / expression / root position は composer contract 外として維持する。
 */
export function applyFullNormalizedPoseApplication(
    vrm: VRM | undefined,
    composerDryRun: SincroVrmPoseComposerDryRunResult,
): FullNormalizedPoseApplicationResult {
    const unavailableReason = fullNormalizedPoseApplicationUnavailableReason(vrm, composerDryRun);
    if (unavailableReason) {
        return {
            applied: false,
            unavailableReason,
            warnings: [unavailableReason],
        };
    }
    const result = composerDryRun.result;
    if (result === undefined) {
        return {
            applied: false,
            unavailableReason: "full_normalized_pose_application_result_missing",
            warnings: ["full_normalized_pose_application_result_missing"],
        };
    }
    if (vrm === undefined) {
        return {
            applied: false,
            unavailableReason: "full_normalized_pose_application_vrm_missing",
            warnings: ["full_normalized_pose_application_vrm_missing"],
        };
    }
    vrm.humanoid.setNormalizedPose(toVrmPose(result.finalPose));
    return { applied: true, warnings: [] };
}

function fullNormalizedPoseApplicationUnavailableReason(
    vrm: VRM | undefined,
    composerDryRun: SincroVrmPoseComposerDryRunResult,
): string | undefined {
    if (!vrm) {
        return "full_normalized_pose_application_vrm_missing";
    }
    if (composerDryRun.status !== "available") {
        return `full_normalized_pose_application_unavailable:${composerDryRun.status}`;
    }
    if (composerDryRun.result === undefined) {
        return "full_normalized_pose_application_result_missing";
    }
    return undefined;
}

function toVrmPose(finalPose: VrmNormalizedLocalPose): VRMPose {
    const pose: VRMPose = {};
    for (const bone of FULL_NORMALIZED_POSE_APPLICATION_BONES) {
        pose[bone] = { rotation: toVrmPoseRotation(finalPose[bone]) };
    }
    return pose;
}

function toVrmPoseRotation(
    quaternion: VrmPoseQuaternion | undefined,
): [number, number, number, number] {
    if (!quaternion) {
        return [0, 0, 0, 1];
    }
    return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function annotateFullNormalizedPoseApplication(
    composerDryRun: SincroVrmPoseComposerDryRunResult,
    application: FullNormalizedPoseApplicationResult,
): SincroVrmPoseComposerDryRunResult {
    return {
        ...composerDryRun,
        fullNormalizedPoseApplication: {
            applied: application.applied,
            unavailableReason: application.unavailableReason,
        },
    };
}

function appendComposerApplicationWarnings(
    composerDryRun: SincroVrmPoseComposerDryRunResult,
    warnings: string[],
): SincroVrmPoseComposerDryRunResult {
    /*
        Debug Console は composer dry-run summary を単一の観測口にしている。
        full application unavailable reason だけ別 channel に分けると実行状態の判断が散るため、
        dry-run service 自体の warning 配列に append して同じ summary へ流す。warning が無い frame は
        object identity を保つ。
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
