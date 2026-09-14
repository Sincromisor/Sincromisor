import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { toMinimalAvatarMotionProfile } from "../avatarProfile/avatarMotionProfileClone";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type {
    SincroPoseRetargetedArm,
    SincroPoseRetargetFrame,
} from "../retargeting/sincroPoseRetargeter";
import { CHARACTER_ARM_REST_POSE } from "../vrmCharacter/characterMotionConfig";
import { composeVrmPose } from "../vrmPose/vrmPoseComposer";
import type {
    VrmNormalizedLocalPose,
    VrmPoseComposerResult,
    VrmPoseLayer,
    VrmPoseQuaternion,
} from "../vrmPose/vrmPoseTypes";
import {
    createSemanticFingerComposerLayers,
    type SincroVrmPoseComposerSemanticFingerInput,
    type SincroVrmPoseComposerSemanticFingerState,
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

/** 追跡が無効なフレームでも代替姿勢で埋める上半身のボーン。 */
const FALLBACK_BONES: VRMHumanBoneName[] = [
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
];

/** 追跡フレームが回転を供給するボーン。upperChestへの配分は合成側で行う。 */
const TRACKING_BONES: VRMHumanBoneName[] = [
    "spine",
    "chest",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
];

/**
 * VRMCharacterManager.update() から呼ばれ、本番へ適用する最終姿勢を合成する。
 * 代替姿勢と追跡層を常に作り、意味に基づく動作・指は切り戻しフラグが `"composer"` かつ
 * 必要なスナップショットと完成版プロファイルが有効な場合だけ追加する。
 * 前回の利用可能な最終姿勢と指の状態を次回の制限・短時間保持に使う。入力不足・不正時は保持値を
 * 更新せず、reset() で破棄する。VRMへの書き込みは管理側が normalizedPoseWriter に委ねる。
 */
export class SincroVrmPoseComposerService {
    private previousFinalPose: VrmNormalizedLocalPose | undefined;
    private previousFinger: SincroVrmPoseComposerSemanticFingerState["previousFinger"] = {};

    /**
     * 前回の最終姿勢と指の保持状態を破棄する。
     * 管理側はVRM初期化と意味に基づく動作・指の切り戻しフラグ変更時に呼び、旧状態を持ち越さない。
     * VRMに適用済みの姿勢や他の制御処理の状態は変更しない。
     */
    reset(): void {
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
        return {
            status: "available",
            result,
            warnings: [...profile.warnings, ...layerResult.warnings, ...result.warnings],
        };
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

// 代替・追跡層へ意味に基づく動作と指の層を追加し、警告と次回の指保持状態を返す。
function createComposerLayers(
    frame: SincroPoseRetargetFrame,
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
    semanticFinger: SincroVrmPoseComposerInput["semanticFinger"],
    state: SincroVrmPoseComposerSemanticFingerState,
): { layers: VrmPoseLayer[]; warnings: string[]; previousFinger: typeof state.previousFinger } {
    const semanticFingerResult = createSemanticFingerComposerLayers(profile, semanticFinger, state);
    return {
        layers: [...createBaseComposerLayers(frame), ...semanticFingerResult.layers],
        warnings: semanticFingerResult.warnings,
        previousFinger: semanticFingerResult.previousFinger,
    };
}

// 追跡が無効なら重みを0にし、同じフレームの代替姿勢を合成結果に残す。
function createBaseComposerLayers(frame: SincroPoseRetargetFrame): VrmPoseLayer[] {
    return [
        {
            id: "production:fallback",
            kind: "fallback",
            blendMode: "override",
            weight: 1,
            pose: createFallbackPose(),
            ownedBones: [...FALLBACK_BONES],
        },
        {
            id: "production:tracking",
            kind: "tracking",
            blendMode: "override",
            weight: frame.active ? 1 : 0,
            pose: createTrackingPose(frame),
            ownedBones: [...TRACKING_BONES],
        },
    ];
}

/*
    追跡 frame が無効でも現在 frame の結果を生成し、前回の追跡姿勢を残さない。
    torso / shoulder は正規化基準へ戻す一方、腕は T ポーズを避けるため既定の待機姿勢へ戻す。
*/
function createFallbackPose(): VrmNormalizedLocalPose {
    const pose: VrmNormalizedLocalPose = {};
    for (const bone of FALLBACK_BONES) {
        pose[bone] = identityQuaternion();
    }
    pose.leftUpperArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.left.upperArm);
    pose.leftLowerArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.left.lowerArm);
    pose.leftHand = eulerQuaternion(CHARACTER_ARM_REST_POSE.left.hand);
    pose.rightUpperArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.right.upperArm);
    pose.rightLowerArm = eulerQuaternion(CHARACTER_ARM_REST_POSE.right.lowerArm);
    pose.rightHand = eulerQuaternion(CHARACTER_ARM_REST_POSE.right.hand);
    return pose;
}

function createTrackingPose(frame: SincroPoseRetargetFrame): VrmNormalizedLocalPose {
    return {
        spine: eulerQuaternion(frame.upperBody.spine),
        chest: eulerQuaternion(frame.upperBody.chest),
        leftShoulder: eulerQuaternion(frame.upperBody.leftShoulder),
        rightShoulder: eulerQuaternion(frame.upperBody.rightShoulder),
        leftUpperArm: armUpperQuaternion(frame.leftArm),
        leftLowerArm: armLowerQuaternion(frame.leftArm),
        leftHand: eulerQuaternion(frame.leftArm.wrist),
        rightUpperArm: armUpperQuaternion(frame.rightArm),
        rightLowerArm: armLowerQuaternion(frame.rightArm),
        rightHand: eulerQuaternion(frame.rightArm.wrist),
    };
}

function armUpperQuaternion(arm: SincroPoseRetargetedArm): VrmPoseQuaternion {
    return arm.upperArmQuaternion ?? eulerQuaternion(arm.upperArm);
}

function armLowerQuaternion(arm: SincroPoseRetargetedArm): VrmPoseQuaternion {
    return arm.lowerArmQuaternion ?? eulerQuaternion(arm.lowerArm);
}

function eulerQuaternion(value: { x: number; y: number; z: number }): VrmPoseQuaternion {
    const quaternion = new Quaternion().setFromEuler(new Euler(value.x, value.y, value.z, "XYZ"));
    return serializeQuaternion(quaternion);
}

function identityQuaternion(): VrmPoseQuaternion {
    return { x: 0, y: 0, z: 0, w: 1 };
}

function serializeQuaternion(quaternion: Quaternion): VrmPoseQuaternion {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

function isFiniteNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}
