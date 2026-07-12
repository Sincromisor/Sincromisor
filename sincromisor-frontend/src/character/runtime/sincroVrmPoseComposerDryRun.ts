import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import {
    type AvatarMotionProfile,
    toMinimalAvatarMotionProfile,
} from "../avatarProfile/avatarMotionProfile";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type {
    SincroPoseRetargetedArm,
    SincroPoseRetargetFrame,
} from "../retargeting/sincroPoseRetargeter";
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
 * production dry-run の可用状態。
 *
 * `available` だけが composer result を持つ。`not_ready` は retarget frame 未到着、
 * `invalid_input` は deltaSeconds など dry-run 境界の値が壊れている状態、`missing_profile` は
 * VRM profile 未計測を表す。失敗状態で前回 result を流用しないことで、Debug Console が古い
 * final pose を現在 frame の結果と誤読しないようにする。
 */
export type SincroVrmPoseComposerDryRunStatus =
    | "available"
    | "not_ready"
    | "invalid_input"
    | "missing_profile";

/**
 * `SincroVrmPoseComposerDryRunService.compose()` の caller 入力。
 *
 * 入力境界は latest retarget frame、AvatarMotionProfile または MinimalAvatarMotionProfile、
 * optional previous final pose、deltaSeconds に限定する。VRM instance、normalized bone node、
 * expression manager、root position は受け取らず、dry-run service から runtime 表示状態へ書き戻せない形にする。
 */
export type SincroVrmPoseComposerDryRunInput = {
    frame?: SincroPoseRetargetFrame;
    profile?: AvatarMotionProfile | MinimalAvatarMotionProfile;
    semanticFinger?: SincroVrmPoseComposerSemanticFingerInput;
    previousFinalPose?: VrmNormalizedLocalPose;
    deltaSeconds?: number;
};

/**
 * production dry-run の結果 contract。
 *
 * `status !== "available"` では `result` を返さない。warning は service 境界の理由と composer warning
 * の短い診断入口であり、suppressed layer や clamped bone の詳細は `result` がある場合だけ参照する。
 */
export type SincroVrmPoseComposerDryRunResult = {
    status: SincroVrmPoseComposerDryRunStatus;
    result?: VrmPoseComposerResult;
    warnings: string[];
    /**
     * manager 側の full `setNormalizedPose(finalPose)` 適用結果を Debug Console へ渡す runtime metadata。
     *
     * dry-run service 自体は VRM を受け取らないため、この field は service では設定しない。`applied=false`
     * でも `status !== "available"` の result 欠損契約は変えず、unavailable reason だけを表示面へ残す。
     */
    fullNormalizedPoseApplication?: {
        applied: boolean;
        unavailableReason?: string;
    };
};

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
 * production `VRMCharacterManager.update()` から VrmPoseComposer を observe-only 実行する stateful service。
 *
 * `compose()` は fallback / tracking layer を常に作り、semantic / finger rollback flag が `"composer"` かつ
 * 保存済み `MotionIntentState`、低次元 Hand snapshot、完成版 `AvatarMotionProfile` が valid な場合だけ
 * semantic layer を追加する。前回 available result の final pose と finger debug は clamp / previous hold 用にだけ
 * 保持し、`reset()`、profile 未準備、invalid input では更新しない。VRM の `setNormalizedPose()`、
 * normalized bone node、expression、root position はこの service の入力にも副作用にも含まれない。
 */
export class SincroVrmPoseComposerDryRunService {
    private previousFinalPose: VrmNormalizedLocalPose | undefined;
    private previousFinger: SincroVrmPoseComposerSemanticFingerState["previousFinger"] = {};

    /**
     * previous final pose lifecycle を明示的に切る。
     *
     * VRM load、camera mode 切替、tracking restart などで古い avatar / frame の clamp 基準を持ち越さないための
     * lifecycle 境界である。VRM に適用済みの姿勢や controller state は変更しない。
     */
    reset(): void {
        this.previousFinalPose = undefined;
        this.previousFinger = {};
    }

    /**
     * latest retarget frame を composer input に変換して dry-run する。
     *
     * result が `available` の場合だけ `previousFinalPose` を次回 clamp 用に更新する。非 available 状態では
     * stale final pose を返さず、caller は `status` と `warnings` を Debug Console の観測点にする。
     */
    compose(input: SincroVrmPoseComposerDryRunInput): SincroVrmPoseComposerDryRunResult {
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
        const layerResult = createDryRunLayers(input.frame, input.profile, input.semanticFinger, {
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

/**
 * lifecycle owner から dry-run service の previous final pose を破棄するための module-level export。
 *
 * class method と同じ処理だが、service 境界を関数 export としてテストや caller から確認できるようにする。
 */
export function reset(service: SincroVrmPoseComposerDryRunService): void {
    service.reset();
}

/**
 * production dry-run を実行する module-level export。
 *
 * class method と同じく VRM 適用は行わず、`status !== "available"` では result を返さない。
 */
export function compose(
    service: SincroVrmPoseComposerDryRunService,
    input: SincroVrmPoseComposerDryRunInput,
): SincroVrmPoseComposerDryRunResult {
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

function createDryRunLayers(
    frame: SincroPoseRetargetFrame,
    profile: AvatarMotionProfile | MinimalAvatarMotionProfile,
    semanticFinger: SincroVrmPoseComposerDryRunInput["semanticFinger"],
    state: SincroVrmPoseComposerSemanticFingerState,
): { layers: VrmPoseLayer[]; warnings: string[]; previousFinger: typeof state.previousFinger } {
    const semanticFingerResult = createSemanticFingerComposerLayers(profile, semanticFinger, state);
    return {
        layers: [...createBaseDryRunLayers(frame), ...semanticFingerResult.layers],
        warnings: semanticFingerResult.warnings,
        previousFinger: semanticFingerResult.previousFinger,
    };
}

function createBaseDryRunLayers(frame: SincroPoseRetargetFrame): VrmPoseLayer[] {
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

function createFallbackPose(): VrmNormalizedLocalPose {
    const pose: VrmNormalizedLocalPose = {};
    for (const bone of FALLBACK_BONES) {
        pose[bone] = identityQuaternion();
    }
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
