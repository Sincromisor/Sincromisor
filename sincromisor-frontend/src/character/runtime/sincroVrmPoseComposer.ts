import { toMinimalAvatarMotionProfile } from "../avatarProfile/avatarMotionProfileClone";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroPoseRetargetFrame } from "../retargeting/sincroPoseRetargeter";
import { composeVrmPose } from "../vrmPose/vrmPoseComposer";
import type { VrmNormalizedLocalPose, VrmPoseComposerResult } from "../vrmPose/vrmPoseTypes";
import { createComposerLayers } from "./sincroVrmPoseComposerLayers";
import type {
    SincroVrmPoseComposerSemanticFingerInput,
    SincroVrmPoseComposerSemanticFingerState,
} from "./sincroVrmPoseComposerSemanticFingerLayers";

/**
 * 本番の姿勢合成結果の利用可否。
 * `available` だけが結果を持つ。`not_ready` は追跡フレーム未到着、`invalid_input` は
 * `deltaSeconds` の不正、`missing_profile` はプロファイル未計測を表す。
 * 利用不可時は前回の結果を返さず、適用側と診断が古い姿勢を現在フレームと誤認することを防ぐ。
 */
export type SincroVrmPoseComposerStatus =
    | "available"
    | "not_ready"
    | "invalid_input"
    | "missing_profile";

/**
 * 本番の姿勢合成に使う追跡フレーム、プロファイル、意味に基づく動作・指の入力。
 * `previousFinalPose` は指定時に内部保持値より優先し、`deltaSeconds` は秒単位で渡す。
 * VRMやボーンノードは受け取らず、返した最終姿勢の書き込みは normalizedPoseWriter が担う。
 */
export type SincroVrmPoseComposerInput = {
    frame?: SincroPoseRetargetFrame;
    profile?: AvatarMotionProfile | MinimalAvatarMotionProfile;
    semanticFinger?: SincroVrmPoseComposerSemanticFingerInput;
    previousFinalPose?: VrmNormalizedLocalPose;
    deltaSeconds?: number;
    /** 仮想/観測時計の同一時刻は合成履歴を二度進めない。 */
    mediaTimeMs?: number;
};

/**
 * 本番の適用側と診断へ渡す合成結果。`status !== "available"` では `result` を返さない。
 * `warnings` は入力と合成の警告をまとめ、抑制層や制限ボーンの詳細は `result` に保持する。
 * 保存・診断側の格納キーは互換性のため `composerDryRun` を維持する。
 */
export type SincroVrmPoseComposerResult = {
    status: SincroVrmPoseComposerStatus;
    result?: VrmPoseComposerResult;
    warnings: string[];
    /**
     * 管理側が normalizedPoseWriter の適用結果を付与する診断情報。合成サービス自身は設定しない。
     * 適用不可でも状態と結果欠損の契約を保ち、理由だけを診断へ渡す。
     */
    fullNormalizedPoseApplication?: {
        applied: boolean;
        unavailableReason?: string;
    };
};

/**
 * VRMCharacterManager.update() から呼ばれ、本番へ適用する最終姿勢を合成する。
 * 代替姿勢と追跡層を常に作り、意味に基づく動作・指は切り戻しフラグが `"composer"` かつ
 * 必要なスナップショットと完成版プロファイルが有効な場合だけ追加する。
 * 前回の利用可能な最終姿勢と指の状態を次回の制限・短時間保持に使う。入力不足・不正時は保持値を
 * 更新せず、reset() で破棄する。VRMへの書き込みは管理側が normalizedPoseWriter に委ねる。
 */
export class SincroVrmPoseComposerService {
    private lastMediaTimeMs?: number;
    private lastResult?: SincroVrmPoseComposerResult;
    private previousFinalPose: VrmNormalizedLocalPose | undefined;
    private previousFinger: SincroVrmPoseComposerSemanticFingerState["previousFinger"] = {};

    /**
     * 前回の最終姿勢と指の保持状態を破棄する。
     * 管理側はVRM初期化と意味に基づく動作・指の切り戻しフラグ変更時に呼び、旧状態を持ち越さない。
     * VRMに適用済みの姿勢や他の制御処理の状態は変更しない。
     */
    reset(): void {
        this.lastMediaTimeMs = undefined;
        this.lastResult = undefined;
        this.previousFinalPose = undefined;
        this.previousFinger = {};
    }

    /**
     * 追跡と補助層から現在フレームの最終姿勢を計算し、本番の適用側へ返す。
     * 利用可能な結果だけを次回の制限・指の短時間保持用に保存する。
     * 入力不足・不正時は状態と警告だけを返し、前回の姿勢を再適用候補にしない。
     */
    compose(input: SincroVrmPoseComposerInput): SincroVrmPoseComposerResult {
        if (!input.frame) {
            return { status: "not_ready", warnings: ["retarget_frame_not_ready"] };
        }
        if (!input.profile) {
            return { status: "missing_profile", warnings: ["avatar_motion_profile_missing"] };
        }
        if (input.deltaSeconds !== undefined && !isFiniteNonNegative(input.deltaSeconds)) {
            return { status: "invalid_input", warnings: ["delta_seconds_invalid"] };
        }

        if (
            input.mediaTimeMs !== undefined &&
            this.lastMediaTimeMs === input.mediaTimeMs &&
            this.lastResult
        )
            return structuredClone(this.lastResult);
        if (
            input.mediaTimeMs !== undefined &&
            this.lastMediaTimeMs !== undefined &&
            input.mediaTimeMs < this.lastMediaTimeMs
        )
            this.reset();
        const profile = normalizeProfile(input.profile);
        const layerResult = createComposerLayers(input.frame, input.profile, input.semanticFinger, {
            previousFinger: this.previousFinger,
        });
        const previousFinalPose = input.previousFinalPose ?? this.previousFinalPose;
        const result = composeVrmPose({
            layers: layerResult.layers,
            profile,
            previousFinalPose,
            deltaSeconds: input.deltaSeconds,
        });
        this.previousFinalPose = structuredClone(result.finalPose);
        this.previousFinger = layerResult.previousFinger;
        this.lastMediaTimeMs = input.mediaTimeMs;
        this.lastResult = {
            status: "available",
            result,
            warnings: [...profile.warnings, ...layerResult.warnings, ...result.warnings],
        };
        return structuredClone(this.lastResult);
    }
}

/** 合成サービスの所有者が前回姿勢と指の保持状態を破棄するための関数形式の入口。 */
export function reset(service: SincroVrmPoseComposerService): void {
    service.reset();
}

/** 本番の最終姿勢を計算する関数形式の入口。VRMへの書き込みは呼び出し側が担う。 */
export function compose(
    service: SincroVrmPoseComposerService,
    input: SincroVrmPoseComposerInput,
): SincroVrmPoseComposerResult {
    return service.compose(input);
}

function normalizeProfile(
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
): MinimalAvatarMotionProfile {
    if (profile.schemaVersion === "sincro.minimal-avatar-motion-profile.v1") {
        return profile;
    }
    return toMinimalAvatarMotionProfile(profile);
}

function isFiniteNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}
