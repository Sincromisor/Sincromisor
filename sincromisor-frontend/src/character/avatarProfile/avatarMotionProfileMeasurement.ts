/** VRMの正規化ボーンを計測し、生成側へThree.jsの参照を含まない値と警告を渡す。 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import {
    AVATAR_MOTION_PROFILE_BONE_NAMES,
    type AvatarMotionProfile,
    type AvatarMotionSide,
} from "./avatarMotionProfileTypes";

/** 計測が読むVRM境界。ノードは保持せず、ワールド行列の更新だけを行う。 */
export type AvatarMotionProfileVrmSource = {
    scene: Object3D;
    meta?: {
        metaVersion?: string;
        name?: string;
        title?: string;
    };
    humanoid: {
        getNormalizedBoneNode(name: VRMHumanBoneName): Object3D | null;
    };
};

/** 計測直後の通常データ。欠損寸法・不正回転はundefinedまたはキー欠損となり、警告で理由を区別する。 */
export type AvatarMotionProfileMeasurement = Pick<
    AvatarMotionProfile,
    "model" | "metrics" | "restLocalRotation" | "warnings"
> & {
    bones: AvatarMotionProfile["capabilities"]["bones"];
};

/** ボーン欠損、寸法、初期回転の順に警告を集める。順序は保存される診断の一部として維持する。 */
export function measureAvatarMotionProfile(
    vrm: AvatarMotionProfileVrmSource,
): AvatarMotionProfileMeasurement {
    vrm.scene.updateMatrixWorld(true);
    const warnings = new Set<string>();
    const boneNodes = collectBoneNodes(vrm, warnings);
    const bones = createBoneCapabilities(boneNodes);
    const metrics = createMetrics(vrm, warnings);
    const restLocalRotation = createRestLocalRotation(boneNodes, warnings);
    return {
        model: createModelProfile(vrm),
        bones,
        metrics,
        restLocalRotation,
        warnings: [...warnings],
    };
}

function collectBoneNodes(
    vrm: AvatarMotionProfileVrmSource,
    warnings: Set<string>,
): Partial<Record<VRMHumanBoneName, Object3D>> {
    const nodes: Partial<Record<VRMHumanBoneName, Object3D>> = {};
    for (const boneName of AVATAR_MOTION_PROFILE_BONE_NAMES) {
        const node = getBoneNode(vrm, boneName);
        if (node === undefined) {
            warnings.add(`missing_${boneName}`);
        } else {
            nodes[boneName] = node;
        }
    }
    return nodes;
}

function createBoneCapabilities(
    boneNodes: Partial<Record<VRMHumanBoneName, Object3D>>,
): Partial<Record<VRMHumanBoneName, boolean>> {
    const bones: Partial<Record<VRMHumanBoneName, boolean>> = {};
    for (const boneName of AVATAR_MOTION_PROFILE_BONE_NAMES) {
        bones[boneName] = boneNodes[boneName] !== undefined;
    }
    return bones;
}

// ローカル回転は成分をそのまま保存し、非有限値のみ欠損扱いにする。正規化や再較正はしない。
function createRestLocalRotation(
    boneNodes: Partial<Record<VRMHumanBoneName, Object3D>>,
    warnings: Set<string>,
): AvatarMotionProfile["restLocalRotation"] {
    const rotations: AvatarMotionProfile["restLocalRotation"] = {};
    for (const boneName of AVATAR_MOTION_PROFILE_BONE_NAMES) {
        const node = boneNodes[boneName];
        if (node === undefined) {
            continue;
        }
        const tuple = finiteQuaternionTuple(
            node.quaternion.x,
            node.quaternion.y,
            node.quaternion.z,
            node.quaternion.w,
        );
        if (tuple === undefined) {
            warnings.add(`invalid_rest_rotation:${boneName}`);
        } else {
            rotations[boneName] = tuple;
        }
    }
    return rotations;
}

// 距離はワールド座標で計測する。既存の下限値と推定順序を保ち、計測不能は警告へ集約する。
function createMetrics(
    vrm: AvatarMotionProfileVrmSource,
    warnings: Set<string>,
): AvatarMotionProfile["metrics"] {
    const shoulderWidth = measureDistance(vrm, "leftUpperArm", "rightUpperArm", 0.08);
    const torsoLength = measureTorsoLength(vrm);
    const upperArmLength = {
        left: measureDistance(vrm, "leftUpperArm", "leftLowerArm", 0.04),
        right: measureDistance(vrm, "rightUpperArm", "rightLowerArm", 0.04),
    };
    const lowerArmLength = {
        left: measureDistance(vrm, "leftLowerArm", "leftHand", 0.04),
        right: measureDistance(vrm, "rightLowerArm", "rightHand", 0.04),
    };
    const handSize = {
        left: measureHandSize(vrm, "left"),
        right: measureHandSize(vrm, "right"),
    };
    addUnmeasuredWarning(warnings, shoulderWidth, "shoulder_width_unmeasured");
    addUnmeasuredWarning(warnings, torsoLength, "torso_length_unmeasured");
    addUnmeasuredWarning(warnings, upperArmLength.left, "left_upper_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, upperArmLength.right, "right_upper_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, lowerArmLength.left, "left_lower_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, lowerArmLength.right, "right_lower_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, handSize.left, "left_hand_size_unmeasured");
    addUnmeasuredWarning(warnings, handSize.right, "right_hand_size_unmeasured");
    return {
        shoulderWidth,
        torsoLength,
        headSize: measureHeadSize(vrm, shoulderWidth, warnings),
        upperArmLength,
        lowerArmLength,
        handSize,
    };
}

// VRM 1.0はname、それ以外はtitleを用い、空文字はモデル名未設定として扱う。
function createModelProfile(vrm: AvatarMotionProfileVrmSource): AvatarMotionProfile["model"] {
    const modelName = vrm.meta?.metaVersion === "1" ? vrm.meta.name : vrm.meta?.title;
    return {
        vrmVersion: vrm.meta?.metaVersion === "1" ? "1.0" : "unknown",
        modelName: nonEmptyStringOrUndefined(modelName),
    };
}

// spineが計測不能な場合だけhipsを基準にする。
function measureTorsoLength(vrm: AvatarMotionProfileVrmSource): number | undefined {
    return (
        measureDistance(vrm, "spine", "chest", 0.06) ?? measureDistance(vrm, "hips", "chest", 0.06)
    );
}

// 首から頭までを優先し、計測不能なら肩幅の0.75倍で推定する。
function measureHeadSize(
    vrm: AvatarMotionProfileVrmSource,
    shoulderWidth: number | undefined,
    warnings: Set<string>,
): number | undefined {
    const measured = measureDistance(vrm, "neck", "head");
    if (measured !== undefined) {
        return measured;
    }
    if (shoulderWidth !== undefined) {
        warnings.add("head_size_estimated_from_shoulder_width");
        return finiteNumberOrUndefined(shoulderWidth * 0.75);
    }
    warnings.add("head_size_unmeasured");
    return undefined;
}

// 人差し指を優先し、欠損または非有限値なら中指までの距離を使う。
function measureHandSize(
    vrm: AvatarMotionProfileVrmSource,
    side: AvatarMotionSide,
): number | undefined {
    const hand = side === "left" ? "leftHand" : "rightHand";
    const index = side === "left" ? "leftIndexProximal" : "rightIndexProximal";
    const middle = side === "left" ? "leftMiddleProximal" : "rightMiddleProximal";
    return measureDistance(vrm, hand, index, 0.02) ?? measureDistance(vrm, hand, middle, 0.02);
}

// 有限の距離だけを返す。短すぎる寸法は従来の下限値へ引き上げ、欠損ノードは補わない。
function measureDistance(
    vrm: AvatarMotionProfileVrmSource,
    fromName: VRMHumanBoneName,
    toName: VRMHumanBoneName,
    minValue?: number,
): number | undefined {
    const from = getBoneNode(vrm, fromName);
    const to = getBoneNode(vrm, toName);
    if (!from || !to) {
        return undefined;
    }
    const distance = worldPosition(from).distanceTo(worldPosition(to));
    const value = minValue === undefined ? distance : Math.max(distance, minValue);
    return finiteNumberOrUndefined(value);
}

function getBoneNode(
    vrm: AvatarMotionProfileVrmSource,
    name: VRMHumanBoneName,
): Object3D | undefined {
    return vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
}

function worldPosition(node: Object3D): Vector3 {
    return node.getWorldPosition(new Vector3());
}

function finiteNumberOrUndefined(value: number): number | undefined {
    return Number.isFinite(value) ? value : undefined;
}

function finiteQuaternionTuple(
    x: number,
    y: number,
    zValue: number,
    w: number,
): readonly [number, number, number, number] | undefined {
    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(zValue) ||
        !Number.isFinite(w)
    ) {
        return undefined;
    }
    return [x, y, zValue, w];
}

function addUnmeasuredWarning(
    warnings: Set<string>,
    value: number | undefined,
    warning: string,
): void {
    if (value === undefined) {
        warnings.add(warning);
    }
}

function nonEmptyStringOrUndefined(value: string | undefined): string | undefined {
    return value === undefined || value.length === 0 ? undefined : value;
}
