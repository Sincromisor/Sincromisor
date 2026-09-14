// reason: structure-threshold-exception 保存検証は分離済み。計測と値の組み立ては task-260914172952-split-avatar-profile-measurement で分離する。
/** VRMから計測してプロファイルを生成する。保存データの検証はavatarMotionProfileSchemaが担う。 */

import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import {
    AVATAR_MOTION_PROFILE_BONE_NAMES,
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    type AvatarMotionFingerName,
    type AvatarMotionProfile,
    type AvatarMotionSide,
} from "./avatarMotionProfileTypes";
import type { MinimalAvatarMotionProfile } from "./minimalAvatarMotionProfile";

type AvatarMotionProfileVrmSource = {
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

type FingerBoneSpec = {
    proximal: VRMHumanBoneName;
    intermediate: VRMHumanBoneName;
    distal: VRMHumanBoneName;
};

const ARM_DEFAULTS: AvatarMotionProfile["arm"] = {
    reachScale: 0.92,
    lateralScale: 0.9,
    verticalScale: 0.95,
    depthCompression: 0.6,
    elbowOutwardBias: 0.25,
    shoulderDamping: 0.55,
};

const WRIST_DEFAULTS: AvatarMotionProfile["wrist"] = {
    wristRollInfluence: 0.4,
    lowerArmTwistShare: 0.65,
    handTwistShare: 0.35,
};

const FINGER_DEFAULTS: AvatarMotionProfile["fingers"] = {
    curlScale: 0.8,
    curlMode: "grouped",
    curlDistribution: { proximal: 0.5, intermediate: 0.3, distal: 0.2 },
    splayLimitDeg: 12,
};

const FINGER_BONE_SPECS: Record<
    AvatarMotionSide,
    Record<AvatarMotionFingerName, FingerBoneSpec>
> = {
    left: {
        thumb: {
            proximal: "leftThumbProximal",
            intermediate: "leftThumbMetacarpal",
            distal: "leftThumbDistal",
        },
        index: {
            proximal: "leftIndexProximal",
            intermediate: "leftIndexIntermediate",
            distal: "leftIndexDistal",
        },
        middle: {
            proximal: "leftMiddleProximal",
            intermediate: "leftMiddleIntermediate",
            distal: "leftMiddleDistal",
        },
        ring: {
            proximal: "leftRingProximal",
            intermediate: "leftRingIntermediate",
            distal: "leftRingDistal",
        },
        little: {
            proximal: "leftLittleProximal",
            intermediate: "leftLittleIntermediate",
            distal: "leftLittleDistal",
        },
    },
    right: {
        thumb: {
            proximal: "rightThumbProximal",
            intermediate: "rightThumbMetacarpal",
            distal: "rightThumbDistal",
        },
        index: {
            proximal: "rightIndexProximal",
            intermediate: "rightIndexIntermediate",
            distal: "rightIndexDistal",
        },
        middle: {
            proximal: "rightMiddleProximal",
            intermediate: "rightMiddleIntermediate",
            distal: "rightMiddleDistal",
        },
        ring: {
            proximal: "rightRingProximal",
            intermediate: "rightRingIntermediate",
            distal: "rightRingDistal",
        },
        little: {
            proximal: "rightLittleProximal",
            intermediate: "rightLittleIntermediate",
            distal: "rightLittleDistal",
        },
    },
};

/** ワールド行列を更新して計測し、欠損ボーン・計測不能値を警告として返す。 */
export function createAvatarMotionProfile(vrm: AvatarMotionProfileVrmSource): AvatarMotionProfile {
    vrm.scene.updateMatrixWorld(true);
    const warnings = new Set<string>();
    const boneNodes = collectBoneNodes(vrm, warnings);
    const bones = createBoneCapabilities(boneNodes);
    const metrics = createMetrics(vrm, warnings);
    const restLocalRotation = createRestLocalRotation(boneNodes, warnings);
    const risk = createRisk(metrics, bones);
    return {
        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
        model: createModelProfile(vrm),
        capabilities: {
            bones,
            fingerChains: createFingerChains(bones),
        },
        restLocalRotation,
        metrics,
        torso: {
            distribution: createTorsoDistribution(bones),
            chestFollow: 0.55,
        },
        arm: { ...ARM_DEFAULTS },
        wrist: { ...WRIST_DEFAULTS },
        fingers: cloneFingerDefaults(),
        risk,
        warnings: [...warnings],
    };
}

/** 動作の変換に必要な値だけを複製し、軽量プロファイルへ変換する。 */
export function toMinimalAvatarMotionProfile(
    profile: AvatarMotionProfile,
): MinimalAvatarMotionProfile {
    return {
        schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
        optionalBones: {
            upperChest: profile.capabilities.bones.upperChest === true,
            leftShoulder: profile.capabilities.bones.leftShoulder === true,
            rightShoulder: profile.capabilities.bones.rightShoulder === true,
            leftHand: profile.capabilities.bones.leftHand === true,
            rightHand: profile.capabilities.bones.rightHand === true,
            leftThumbProximal: profile.capabilities.bones.leftThumbProximal === true,
            rightThumbProximal: profile.capabilities.bones.rightThumbProximal === true,
            leftIndexProximal: profile.capabilities.bones.leftIndexProximal === true,
            rightIndexProximal: profile.capabilities.bones.rightIndexProximal === true,
        },
        measurements: {
            shoulderWidth: profile.metrics.shoulderWidth,
            leftUpperArmLength: profile.metrics.upperArmLength.left,
            leftLowerArmLength: profile.metrics.lowerArmLength.left,
            rightUpperArmLength: profile.metrics.upperArmLength.right,
            rightLowerArmLength: profile.metrics.lowerArmLength.right,
            headSize: profile.metrics.headSize,
        },
        torso: {
            distribution: { ...profile.torso.distribution },
        },
        solverDefaults: {
            defaultReachScale: profile.arm.reachScale,
            depthCompression: profile.arm.depthCompression,
            lateralScale: profile.arm.lateralScale,
            verticalScale: profile.arm.verticalScale,
            shoulderDamping: profile.arm.shoulderDamping,
            wristRollInfluence: profile.wrist.wristRollInfluence,
        },
        warnings: [...profile.warnings],
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

function createFingerChains(
    bones: Partial<Record<VRMHumanBoneName, boolean>>,
): AvatarMotionProfile["capabilities"]["fingerChains"] {
    return {
        left: createSideFingerChains("left", bones),
        right: createSideFingerChains("right", bones),
    };
}

function createSideFingerChains(
    side: AvatarMotionSide,
    bones: Partial<Record<VRMHumanBoneName, boolean>>,
): AvatarMotionProfile["capabilities"]["fingerChains"][AvatarMotionSide] {
    const specs = FINGER_BONE_SPECS[side];
    return {
        thumb: createFingerChain(specs.thumb, bones),
        index: createFingerChain(specs.index, bones),
        middle: createFingerChain(specs.middle, bones),
        ring: createFingerChain(specs.ring, bones),
        little: createFingerChain(specs.little, bones),
    };
}

function createFingerChain(
    spec: FingerBoneSpec,
    bones: Partial<Record<VRMHumanBoneName, boolean>>,
): AvatarMotionProfile["capabilities"]["fingerChains"][AvatarMotionSide][AvatarMotionFingerName] {
    return {
        proximal: bones[spec.proximal] === true,
        intermediate: bones[spec.intermediate] === true,
        distal: bones[spec.distal] === true,
    };
}

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

function createModelProfile(vrm: AvatarMotionProfileVrmSource): AvatarMotionProfile["model"] {
    const modelName = vrm.meta?.metaVersion === "1" ? vrm.meta.name : vrm.meta?.title;
    return {
        vrmVersion: vrm.meta?.metaVersion === "1" ? "1.0" : "unknown",
        modelName: nonEmptyStringOrUndefined(modelName),
    };
}

function createTorsoDistribution(
    bones: Partial<Record<VRMHumanBoneName, boolean>>,
): AvatarMotionProfile["torso"]["distribution"] {
    if (bones.spine === true && bones.chest === true && bones.upperChest === true) {
        return { spine: 0.25, chest: 0.4, upperChest: 0.35 };
    }
    if (bones.spine === true && bones.chest === true) {
        return { spine: 0.35, chest: 0.65, upperChest: 0 };
    }
    return { spine: 1, chest: 0, upperChest: 0 };
}

function createRisk(
    metrics: AvatarMotionProfile["metrics"],
    bones: Partial<Record<VRMHumanBoneName, boolean>>,
): AvatarMotionProfile["risk"] {
    const smallBodyLargeHead =
        metrics.headSize !== undefined && metrics.torsoLength !== undefined
            ? clamp01((metrics.headSize / metrics.torsoLength - 0.45) / 0.35)
            : 0;
    const missingUpperChest = bones.upperChest !== true;
    const missingShoulders = bones.leftShoulder !== true || bones.rightShoulder !== true;
    return {
        smallBodyLargeHead,
        missingUpperChest,
        missingShoulders,
        constraintRisk: clamp01(
            smallBodyLargeHead * 0.45 +
                (missingUpperChest ? 0.25 : 0) +
                (missingShoulders ? 0.3 : 0),
        ),
    };
}

function measureTorsoLength(vrm: AvatarMotionProfileVrmSource): number | undefined {
    return (
        measureDistance(vrm, "spine", "chest", 0.06) ?? measureDistance(vrm, "hips", "chest", 0.06)
    );
}

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

function measureHandSize(
    vrm: AvatarMotionProfileVrmSource,
    side: AvatarMotionSide,
): number | undefined {
    const hand = side === "left" ? "leftHand" : "rightHand";
    const index = side === "left" ? "leftIndexProximal" : "rightIndexProximal";
    const middle = side === "left" ? "leftMiddleProximal" : "rightMiddleProximal";
    return measureDistance(vrm, hand, index, 0.02) ?? measureDistance(vrm, hand, middle, 0.02);
}

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

function cloneFingerDefaults(): AvatarMotionProfile["fingers"] {
    return {
        curlScale: FINGER_DEFAULTS.curlScale,
        curlMode: FINGER_DEFAULTS.curlMode,
        curlDistribution: { ...FINGER_DEFAULTS.curlDistribution },
        splayLimitDeg: FINGER_DEFAULTS.splayLimitDeg,
    };
}

function nonEmptyStringOrUndefined(value: string | undefined): string | undefined {
    return value === undefined || value.length === 0 ? undefined : value;
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
