// reason: structure-threshold-exception VRM読込と毎フレーム制御の所有を保つ。URL利用期間は読込境界に閉じ、選択側の所有管理は別層へ委ねる。
import { type VRM, VRMUtils } from "@pixiv/three-vrm";
import type { Object3D, Scene } from "three";
import { Timer, Vector3 } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { frontendLogger } from "../../shared/logging/appLogger";
import { toMinimalAvatarMotionProfile } from "../avatarProfile/avatarMotionProfileClone";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import {
    type CharacterBehaviorSnapshot,
    CharacterBehaviorState,
} from "../behavior/characterBehaviorState";
import type { EyeBehaviorController } from "../behavior/eyeBehaviorController";
import type { FaceEmotionController } from "../behavior/faceEmotionController";
import type { FaceMorphController } from "../behavior/faceMorphController";
import type { HeadBoneController } from "../behavior/headBoneController";
import { SincroFaceRetargeter } from "../retargeting/sincroFaceRetargeter";
import {
    type SincroPoseRetargetConfig,
    SincroPoseRetargeter,
} from "../retargeting/sincroPoseRetargeter";
import { summarizeComposerDryRun } from "../runtime/sincroMotionObserveOnlyPipelineTypes";
import {
    type SincroVrmPoseComposerResult,
    SincroVrmPoseComposerService,
} from "../runtime/sincroVrmPoseComposer";
import type { VRMCamera } from "../scene/vrmCamera";
import type { ArmBoneController } from "./armBoneController";
import type { CharacterMotionTuning } from "./characterMotionConfig";
import type { CharacterRootStabilizer } from "./characterRootStabilizer";
import type { LegBoneController } from "./legBoneController";
import {
    applyFullNormalizedPoseApplication,
    type FullNormalizedPoseApplicationResult,
} from "./normalizedPoseWriter";
import type { VRMDiagnostics } from "./vrmDiagnostics";
import { applyInitialUpperBodyFraming } from "./vrmInitialUpperBodyFraming";
import { loadVrmModel } from "./vrmModelLoader";
import { createVrmModelRuntime } from "./vrmModelRuntime";

/** VRM読込・表示設定と、呼び出し側が所有する任意の診断通知先。 */
export type VRMCharacterManagerOptions = {
    diagnostics?: VRMDiagnostics;
    scene: Scene;
    vrmCamera: VRMCamera;
    vrmUrl: string;
    /** 読込終端で呼ぶ冪等な終了通知を返す。外部URLの場合は省略できる。 */
    retainVrmUrl?: (url: string) => () => void;
    onThumbnailLoaded?: (
        thumbnailImage: HTMLImageElement | undefined,
        isCurrent: () => boolean,
    ) => void;
    loadSignal?: AbortSignal;
    enableInitialUpperBodyFraming?: boolean;
};

/**
 * VRM 1.0 の読込と各制御処理を所有し、描画ループから毎フレーム更新する。
 * 同一フレームの合成結果を normalizedPoseWriter へ一度渡し、適用結果を診断へ通知する。
 * 適用不可でも旧上半身直接制御へ切り戻さず、頭部・表情、脚、VRM内部更新、腰の復元順を保つ。
 */
export class VRMCharacterManager {
    public vrm?: VRM;
    private motionSeries?: number;
    private lastMotionTimeMs?: number;
    private readonly timer = new Timer();
    private scene: Scene;
    private vrmCamera: VRMCamera;
    public headBoneController?: HeadBoneController;
    public armBoneController?: ArmBoneController;
    public legBoneController?: LegBoneController;
    public rootStabilizer?: CharacterRootStabilizer;
    public mouthMorphController?: FaceMorphController;
    public emotionMorphController?: FaceEmotionController;
    public eyeBehaviorController?: EyeBehaviorController;
    public characterPosition: Vector3 = new Vector3(0, 0, 0);
    private defaultPosition: Vector3 = new Vector3(0, 0, 0);
    private rootBone?: Object3D;
    private readonly behaviorState: CharacterBehaviorState;
    private readonly sincroFaceRetargeter = new SincroFaceRetargeter();
    private sincroPoseRetargeter = new SincroPoseRetargeter();
    private poseConfig: Partial<SincroPoseRetargetConfig> = {};
    private motionTuning: Partial<CharacterMotionTuning> = {};
    private poseComposer = new SincroVrmPoseComposerService();
    private latestBehaviorSnapshot?: CharacterBehaviorSnapshot;
    private motionElapsedSeconds = 0;
    // VRMロード完了後、UI層へthumbnailImageを通知するためのフック。
    private readonly onThumbnailLoaded?: VRMCharacterManagerOptions["onThumbnailLoaded"];
    private readonly diagnostics?: VRMDiagnostics;
    private readonly enableInitialUpperBodyFraming: boolean;
    private visible: boolean = true;
    private readonly retainVrmUrl?: (url: string) => () => void;
    private loadGeneration = 0;
    private activeUrl?: string;
    /** 初回読込の結果。再試行と交換はreplaceVrmへ渡す。 */
    readonly ready: Promise<void>;

    constructor(options: VRMCharacterManagerOptions) {
        this.diagnostics = options.diagnostics;
        this.scene = options.scene;
        this.vrmCamera = options.vrmCamera;
        this.onThumbnailLoaded = options.onThumbnailLoaded;
        this.retainVrmUrl = options.retainVrmUrl;
        this.enableInitialUpperBodyFraming = options.enableInitialUpperBodyFraming ?? false;
        this.behaviorState = CharacterBehaviorState.getManager();
        this.ready = this.replaceVrm(options.vrmUrl, options.loadSignal);
        // 初回失敗はreplaceVrmで記録済み。readyを待たない診断ページでも未処理拒否にしない。
        void this.ready.catch(() => undefined);
    }

    /**
     * 同一モデルは再利用し、現在の開始世代で準備できた候補だけを既存シーンへ反映する。
     * 読込・準備失敗はrejectし、旧モデルを保持する。旧世代や取消し済みの候補は解放する。
     */
    async replaceVrm(url: string, signal?: AbortSignal): Promise<void> {
        const generation = ++this.loadGeneration;
        const isCurrent = () => generation === this.loadGeneration && !signal?.aborted;
        if (!isCurrent()) throw new DOMException("Model loading cancelled", "AbortError");
        if (url === this.activeUrl) return;
        const releaseUrl = this.retainVrmUrl?.(url);
        let gltf: GLTF | undefined;
        let adopted = false;
        try {
            gltf = await loadVrmModel(url);
            if (!isCurrent()) throw new DOMException("Model loading cancelled", "AbortError");
            this.attachLoadedVrm(gltf, isCurrent);
            this.activeUrl = url;
            adopted = true;
            frontendLogger.diagnostic("model", "ready");
        } catch (error) {
            if (gltf && !adopted) VRMUtils.deepDispose(gltf.scene);
            if (isCurrent()) frontendLogger.error("Failed to load VRM model.", { error });
            throw error;
        } finally {
            releaseUrl?.();
        }
    }

    private attachLoadedVrm(gltf: GLTF, isCurrent: () => boolean): void {
        const candidate: unknown = gltf.userData.vrm;
        if (!isLoadedVrm(candidate))
            throw new Error("Loaded GLTF does not contain a VRM instance.");
        // 候補側の変換器と合成器も新規に作り、準備失敗で旧モデルの内部状態を壊さない。
        const next = createVrmModelRuntime({
            vrm: candidate,
            camera: this.vrmCamera,
            config: this.poseConfig,
            tuning: this.motionTuning,
            elapsedSeconds: this.motionElapsedSeconds,
            diagnostics: this.diagnostics,
        });
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.combineMorphs(candidate);
        candidate.scene.visible = this.visible;
        candidate.scene.traverse((object) => {
            object.castShadow = true;
        });
        const profile = next.sincroPoseRetargeter.getAvatarMotionProfile();
        this.diagnostics?.onAvatarMotionProfile?.(
            profile ? toMinimalAvatarMotionProfile(profile) : undefined,
        );
        const thumbnail =
            candidate.meta.metaVersion === "1"
                ? (candidate.meta.thumbnailImage ?? undefined)
                : undefined;
        let adopted = false;
        // 採用後の画像は要求世代ではなく表示中モデルへ結び、同一モデル再開始でも有効に保つ。
        const thumbnailIsCurrent = () => (adopted ? this.vrm === candidate : isCurrent());
        this.onThumbnailLoaded?.(thumbnail, thumbnailIsCurrent);
        if (!isCurrent()) throw new DOMException("Model loading cancelled", "AbortError");
        if (this.enableInitialUpperBodyFraming)
            applyInitialUpperBodyFraming(candidate, this.vrmCamera);
        const previous = this.vrm;
        this.scene.add(candidate.scene);
        Object.assign(this, next);
        adopted = true;
        this.motionSeries = undefined;
        this.lastMotionTimeMs = undefined;
        // 交換が成功するまで旧シーンと制御を保持し、その後だけ旧GPU資源を解放する。
        if (previous) {
            this.scene.remove(previous.scene);
            VRMUtils.deepDispose(previous.scene);
        }
    }

    /** 対話状態から姿勢を合成し、頭部・表情、最終姿勢、脚、VRM内部更新、腰の復元の順に反映する。 */
    update(nowMs: number = performance.now()): void {
        const clock = this.behaviorState.motionClock.evaluate(nowMs);
        if (clock.series !== this.motionSeries) {
            this.sincroPoseRetargeter.reset();
            this.poseComposer.reset();
            this.lastMotionTimeMs = undefined;
            this.motionSeries = clock.series;
        }
        const motionTimeMs = clock.poseTimeMs ?? nowMs;
        const motionDeltaSeconds =
            this.lastMotionTimeMs === undefined
                ? 1 / 60
                : Math.max(0, motionTimeMs - this.lastMotionTimeMs) / 1000;
        this.lastMotionTimeMs = motionTimeMs;
        // Timerは読取りでは進まないため、同じフレーム時刻で一度更新して秒単位の差分を共有する。
        this.timer.update(nowMs);
        const deltaSeconds = this.timer.getDelta();
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
        const sincroPose = this.sincroPoseRetargeter.retarget(poseMotionForRetarget, motionTimeMs, {
            mediaTimeMs: clock.poseTimeMs,
            temporal:
                clock.poseTimeMs === undefined
                    ? undefined
                    : this.latestBehaviorSnapshot.sincroMotionPipeline?.temporal,
            profile: minimalAvatarMotionProfile,
        });
        this.diagnostics?.onPoseRetargetFrame?.(sincroPose);
        const composerResult = this.poseComposer.compose({
            frame: sincroPose,
            profile: avatarMotionProfile,
            semanticFinger: {
                intent: this.latestBehaviorSnapshot.sincroMotionPipeline?.intent,
                hand: this.latestBehaviorSnapshot.sincroMotionPipeline?.hand,
                mediaTimeMs: clock.handTimeMs,
                poseMediaTimeMs: clock.poseTimeMs,
                temporal: this.latestBehaviorSnapshot.sincroMotionPipeline?.temporal,
                trackingEnabled: this.latestBehaviorSnapshot.motionPolicy.allowPoseRetarget,
                observedAtMs:
                    this.latestBehaviorSnapshot.sincroMotionPipeline?.hand?.lastUpdatedAtMs,
            },
            deltaSeconds: motionDeltaSeconds,
            mediaTimeMs: motionTimeMs,
        });
        this.headBoneController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.eyeBehaviorController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.mouthMorphController?.update(this.latestBehaviorSnapshot, sincroFace);
        this.emotionMorphController?.update(this.latestBehaviorSnapshot);
        const fullApplication = applyFullNormalizedPoseApplication(this.vrm, composerResult);
        const observedComposerResult = annotateFullNormalizedPoseApplication(
            appendComposerApplicationWarnings(composerResult, fullApplication.warnings),
            fullApplication,
        );
        // 要約は配列と適用情報を独立生成するため、診断用に顔・姿勢・合成結果を再複製しない。
        this.diagnostics?.onComposerSummary?.(summarizeComposerDryRun(observedComposerResult));
        this.diagnostics?.onComposerResult?.(observedComposerResult);
        this.legBoneController?.update(this.motionElapsedSeconds);
        this.vrm?.update(deltaSeconds);
        if (this.rootBone) {
            const hipsBasePosition = this.defaultPosition.clone().add(this.characterPosition);
            this.rootBone.position.copy(hipsBasePosition);
            this.rootStabilizer?.update(hipsBasePosition);
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
        this.motionTuning = { ...this.motionTuning, ...tuning };
        this.eyeBehaviorController?.setTuning(tuning);
    }

    /**
     * 診断操作などの姿勢調整を姿勢変換処理へ渡す。合成サービスの前回姿勢と指の保持状態は維持する。
     * VRMの姿勢や表情への書き込みは毎フレームの更新処理に委ねる。
     */
    setSincroPoseRetargetConfig(config: Partial<SincroPoseRetargetConfig>): void {
        this.poseConfig = { ...this.poseConfig, ...config };
        this.sincroPoseRetargeter.setConfig(config);
    }

    getAvatarMotionProfile(): AvatarMotionProfile | undefined {
        return this.sincroPoseRetargeter.getAvatarMotionProfile();
    }
}

// 合成処理自体はVRMを書き込まないため、受け取った適用結果を管理側で診断用に付与する。
function annotateFullNormalizedPoseApplication(
    composerResult: SincroVrmPoseComposerResult,
    application: FullNormalizedPoseApplicationResult,
): SincroVrmPoseComposerResult {
    return {
        ...composerResult,
        fullNormalizedPoseApplication: {
            applied: application.applied,
            unavailableReason: application.unavailableReason,
        },
    };
}

function appendComposerApplicationWarnings(
    composerResult: SincroVrmPoseComposerResult,
    warnings: string[],
): SincroVrmPoseComposerResult {
    // 適用不可理由も合成結果の診断へまとめる。警告が無い場合は元のオブジェクトを保つ。
    if (warnings.length === 0) {
        return composerResult;
    }
    return {
        ...composerResult,
        warnings: [...composerResult.warnings, ...warnings],
    };
}

function isLoadedVrm(value: unknown): value is VRM {
    return !!value && typeof value === "object" && "scene" in value && "humanoid" in value;
}
