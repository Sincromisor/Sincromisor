/** 合成結果の検査・VRMPoseへの変換・書き込みを担う。読込と診断への注釈付与は管理側が所有する。 */
import type { VRM, VRMHumanBoneName, VRMPose } from "@pixiv/three-vrm";
import type { SincroVrmPoseComposerResult } from "../runtime/sincroVrmPoseComposer";
import type { VrmNormalizedLocalPose, VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";

/** 一括適用が所有する上半身と指。欠損値は単位回転で補完する。 */
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

/** 現在フレームの適用結果。利用不可は診断用であり、旧直接制御への切り戻し条件にしない。 */
export type FullNormalizedPoseApplicationResult = {
    applied: boolean;
    /** VRM未読込・合成結果の利用不可・結果欠損を区別する理由コード。 */
    unavailableReason?: string;
    /** 管理側が合成結果の診断へ合流する警告。意味に基づく動作・指の警告は合成側で保持する。 */
    warnings: string[];
};

/**
 * 呼び出し側が渡す現在フレームの合成結果を、利用可能な場合だけ一度VRMへ書き込む。
 * 結果を保持しないため利用不可時に古い姿勢を再適用しない。所有外の頭部・首・脚・表情・腰位置は触らない。
 */
export function applyFullNormalizedPoseApplication(
    vrm: VRM | undefined,
    composerResult: SincroVrmPoseComposerResult,
): FullNormalizedPoseApplicationResult {
    const unavailableReason = fullNormalizedPoseApplicationUnavailableReason(vrm, composerResult);
    if (unavailableReason) {
        return {
            applied: false,
            unavailableReason,
            warnings: [unavailableReason],
        };
    }
    const result = composerResult.result;
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
    composerResult: SincroVrmPoseComposerResult,
): string | undefined {
    if (!vrm) {
        return "full_normalized_pose_application_vrm_missing";
    }
    if (composerResult.status !== "available") {
        return `full_normalized_pose_application_unavailable:${composerResult.status}`;
    }
    if (composerResult.result === undefined) {
        return "full_normalized_pose_application_result_missing";
    }
    return undefined;
}

// 所有ボーンを毎回埋め、欠損した指などに前フレームの回転を残さない。
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
