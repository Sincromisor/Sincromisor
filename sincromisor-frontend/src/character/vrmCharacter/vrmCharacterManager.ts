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
    type FullNormalizedPoseApplicationMode,
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
 * dry-run が同一 frame の available result を返す場合だけここで 1 回実行し、失敗時は段階別 rollback path に戻す。
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
    private composerTorsoShoulderApplicationMode =
        DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerTorsoShoulderApplicationMode;
    private composerSemanticFingerApplicationMode =
        DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerSemanticFingerApplicationMode;
    private fullNormalizedPoseApplicationMode =
        DEFAULT_SINCRO_POSE_RETARGET_CONFIG.fullNormalizedPoseApplicationMode;
    private fullNormalizedPoseApplicationApplied = false;
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
        this.fullNormalizedPoseApplicationApplied = false;
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
        const fullApplication = applyFullNormalizedPoseApplication(
            this.vrm,
            this.fullNormalizedPoseApplicationMode,
            composerDryRun,
            {
                clearPreviousApplication: this.fullNormalizedPoseApplicationApplied,
            },
        );
        this.fullNormalizedPoseApplicationApplied = fullApplication.applied;
        const armUpdate = fullApplication.applied
            ? undefined
            : this.armBoneController?.update(
                  this.motionElapsedSeconds,
                  this.latestBehaviorSnapshot,
                  sincroPose,
                  {
                      mode: this.composerArmApplicationMode,
                      composerDryRun,
                  },
              );
        const observedComposerDryRun = annotateFullNormalizedPoseApplication(
            appendComposerApplicationWarnings(composerDryRun, [
                ...(armUpdate?.composerArmApplicationWarnings ?? []),
                ...fullApplication.warnings,
            ]),
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
            const motionOrchestratorUpdate = fullApplication.applied
                ? undefined
                : this.motionOrchestrator?.update(
                      this.motionElapsedSeconds,
                      this.latestBehaviorSnapshot,
                      hipsBasePosition,
                      sincroPose,
                      {
                          mode: this.composerTorsoShoulderApplicationMode,
                          profile: minimalAvatarMotionProfile,
                      },
                  );
            if (motionOrchestratorUpdate) {
                const nextComposerDryRun = annotateFullNormalizedPoseApplication(
                    appendComposerApplicationWarnings(
                        this.sincroMotionPipelineState.composerDryRun ?? observedComposerDryRun,
                        motionOrchestratorUpdate.composerTorsoShoulderApplicationWarnings,
                    ),
                    fullApplication,
                );
                this.sincroMotionPipelineState = cloneSincroMotionPipelineState({
                    ...this.sincroMotionPipelineState,
                    composerDryRun: nextComposerDryRun,
                    updatedAtMs: nowMs,
                });
                DebugConsoleManager.getManager().updateSincroComposerDryRunSummary(
                    summarizeComposerDryRun(this.sincroMotionPipelineState.composerDryRun),
                );
                DebugConsoleManager.getManager().updateSincroComposerDryRunResult(
                    nextComposerDryRun,
                );
            }
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
     * composer application flag の切替時だけ production dry-run の previous final pose を reset し、
     * 前 mode の angular velocity clamp 基準や finger previous hold を次 frame に持ち越さない。arm、
     * torso / shoulder、semantic / finger、full normalized pose application は別 flag として保持し、
     * 片方の mode 変更がもう片方の所有境界を暗黙に変えない。retargeter config は常に転送するが、
     * VRM normalized pose や expression はここでは書き込まない。
     */
    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        const nextComposerArmApplicationMode =
            config.composerArmApplicationMode ?? this.composerArmApplicationMode;
        const nextComposerTorsoShoulderApplicationMode =
            config.composerTorsoShoulderApplicationMode ??
            this.composerTorsoShoulderApplicationMode;
        const nextComposerSemanticFingerApplicationMode =
            config.composerSemanticFingerApplicationMode ??
            this.composerSemanticFingerApplicationMode;
        const nextFullNormalizedPoseApplicationMode =
            config.fullNormalizedPoseApplicationMode ?? this.fullNormalizedPoseApplicationMode;
        if (
            nextComposerArmApplicationMode !== this.composerArmApplicationMode ||
            nextComposerTorsoShoulderApplicationMode !==
                this.composerTorsoShoulderApplicationMode ||
            nextComposerSemanticFingerApplicationMode !==
                this.composerSemanticFingerApplicationMode ||
            nextFullNormalizedPoseApplicationMode !== this.fullNormalizedPoseApplicationMode
        ) {
            /*
                feature flag の切替 frame では、前 mode で生成された composer final pose を
                angular velocity clamp の previous として使わず、finger previous hold も破棄する。
                full normalized pose application だけは pose 値ではなく「前 frame に full stage が
                upper body / finger を所有した」という lifecycle state を持つ。mode off や unavailable
                rollback へ戻る次の update では、その state を見て staged writer の前に identity clear を
                入れ、direct path が所有しない finger pose の残留を消す。そのためここでは
                fullNormalizedPoseApplicationApplied を reset しない。
            */
            this.composerDryRun.reset();
            this.composerArmApplicationMode = nextComposerArmApplicationMode;
            this.composerTorsoShoulderApplicationMode = nextComposerTorsoShoulderApplicationMode;
            this.composerSemanticFingerApplicationMode = nextComposerSemanticFingerApplicationMode;
            this.fullNormalizedPoseApplicationMode = nextFullNormalizedPoseApplicationMode;
        }
        this.sincroPoseRetargeter.setConfig(config);
    }

    getAvatarMotionProfile(): AvatarMotionProfile | undefined {
        return this.sincroPoseRetargeter.getAvatarMotionProfile();
    }
}

/**
 * Outcome of one full normalized pose application attempt.
 *
 * The result is a frame-local caller contract: `applied=true` means the VRM already received the
 * composer-owned upper-body pose and direct upper-body writers must be skipped; `applied=false`
 * means callers should run the staged fallback path and use `rollbackReason` / `warnings` for
 * Debug Console visibility. The failure conditions are explicit mode off, missing VRM, non-
 * available dry-run status, and available dry-run frames that lack a result.
 */
export type FullNormalizedPoseApplicationResult = {
    /**
     * The currently selected runtime mode. Callers should surface this with rollback state so a
     * disabled full application can be distinguished from an unavailable composer frame.
     */
    mode: FullNormalizedPoseApplicationMode;
    /**
     * True only when the current frame's available composer result was applied to the VRM. When
     * true, callers must skip upper-body direct writers in the same frame to avoid double
     * application.
     */
    applied: boolean;
    /**
     * Present when the helper deliberately did not apply the current composer result. Reasons cover
     * mode off, missing VRM, non-available dry-run status, and available frames without a result.
     */
    rollbackReason?: string;
    /**
     * Warning codes that should be appended to Debug Console composer summaries. Mode `off` is a
     * rollback reason but not a warning; runtime failure conditions and unavailable frames are
     * warnings.
     */
    warnings: string[];
};

type FullNormalizedPoseApplicationOptions = {
    clearPreviousApplication?: boolean;
};

/**
 * upper body composer finalPose を VRM humanoid へ 1 frame 1 回だけ適用する。
 *
 * caller はこの関数が `applied=true` を返す frame では arm / torso / shoulder の direct write を呼ばない。
 * `status !== "available"`、result 欠損、VRM 未ロードでは stale finalPose を再利用せず、rollback reason と
 * warning だけを返す。head / neck / leg / expression は finalPose に含めない composer contract 側で非対象にする。
 */
export function applyFullNormalizedPoseApplication(
    vrm: VRM | undefined,
    mode: FullNormalizedPoseApplicationMode,
    composerDryRun: SincroVrmPoseComposerDryRunResult,
    options: FullNormalizedPoseApplicationOptions = {},
): FullNormalizedPoseApplicationResult {
    if (mode === "off") {
        if (vrm && options.clearPreviousApplication) {
            vrm.humanoid.setNormalizedPose(toIdentityVrmPose());
        }
        return {
            mode,
            applied: false,
            rollbackReason: "full_normalized_pose_application_off",
            warnings: [],
        };
    }
    const rollbackReason = fullNormalizedPoseApplicationRollbackReason(vrm, composerDryRun);
    if (rollbackReason) {
        if (vrm && options.clearPreviousApplication) {
            vrm.humanoid.setNormalizedPose(toIdentityVrmPose());
        }
        return {
            mode,
            applied: false,
            rollbackReason,
            warnings: [rollbackReason],
        };
    }
    const result = composerDryRun.result;
    if (result === undefined) {
        return {
            mode,
            applied: false,
            rollbackReason: "full_normalized_pose_application_result_missing",
            warnings: ["full_normalized_pose_application_result_missing"],
        };
    }
    if (vrm === undefined) {
        return {
            mode,
            applied: false,
            rollbackReason: "full_normalized_pose_application_vrm_missing",
            warnings: ["full_normalized_pose_application_vrm_missing"],
        };
    }
    vrm.humanoid.setNormalizedPose(toVrmPose(result.finalPose));
    return { mode, applied: true, warnings: [] };
}

function fullNormalizedPoseApplicationRollbackReason(
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

function toIdentityVrmPose(): VRMPose {
    return toVrmPose({});
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
            mode: application.mode,
            applied: application.applied,
            rollbackReason: application.rollbackReason,
        },
    };
}

function appendComposerApplicationWarnings(
    composerDryRun: SincroVrmPoseComposerDryRunResult,
    warnings: string[],
): SincroVrmPoseComposerDryRunResult {
    /*
        Debug Console は composer dry-run summary を単一の観測口にしている。
        arm / torso / full application fallback だけ別 channel に分けると rollback 判断が散るため、
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
