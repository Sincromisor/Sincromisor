/** ボーン計測結果から既定の動作値と対応能力を組み立てる。VRM参照と保存検証は別モジュールが担う。 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { AvatarMotionProfileMeasurement } from "./avatarMotionProfileMeasurement";
import {
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    type AvatarMotionFingerName,
    type AvatarMotionProfile,
    type AvatarMotionSide,
} from "./avatarMotionProfileTypes";

type FingerBoneSpec = {
    proximal: VRMHumanBoneName;
    intermediate: VRMHumanBoneName;
    distal: VRMHumanBoneName;
};

/** 既存の腕・手首・指の調整値。計測結果に応じた再較正は行わない。 */
const ARM_DEFAULTS: AvatarMotionProfile["arm"] = {
    reachScale: 0.92,
    lateralScale: 0.9,
    verticalScale: 0.95,
    depthCompression: 0.6,
    elbowOutwardBias: 0.25,
    shoulderDamping: 0.55,
};

/** 前腕と手へのねじれ配分を含む手首の既定値。 */
const WRIST_DEFAULTS: AvatarMotionProfile["wrist"] = {
    wristRollInfluence: 0.4,
    lowerArmTwistShare: 0.65,
    handTwistShare: 0.35,
};

/** 指はグループ曲げを使い、各関節へ固定比率で配分する。 */
const FINGER_DEFAULTS: AvatarMotionProfile["fingers"] = {
    curlScale: 0.8,
    curlMode: "grouped",
    curlDistribution: { proximal: 0.5, intermediate: 0.3, distal: 0.2 },
    splayLimitDeg: 12,
};

/** 既存の指関節対応。親指の中間位置はMetacarpalとして扱う。 */
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

/** 計測結果へ既定値とリスク値を付ける。計測済みの値は引き継ぎ、警告の順序を変えない。 */
export function createAvatarMotionProfile(
    measurement: AvatarMotionProfileMeasurement,
): AvatarMotionProfile {
    const { model, bones, metrics, restLocalRotation, warnings } = measurement;
    const risk = createRisk(metrics, bones);
    return {
        schemaVersion: AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
        model,
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

// 左右・指ごとに3関節の有無を値へ変換する。欠損した関節はfalseのまま保持する。
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

// 利用可能な体幹ボーンへ既存比率で配分し、胸が無ければspineへ集約する。
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

// 頭と体幹の比率、胸・肩の欠損から既存の経験的な危険度を0〜1で返す。
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

function cloneFingerDefaults(): AvatarMotionProfile["fingers"] {
    return {
        curlScale: FINGER_DEFAULTS.curlScale,
        curlMode: FINGER_DEFAULTS.curlMode,
        curlDistribution: { ...FINGER_DEFAULTS.curlDistribution },
        splayLimitDeg: FINGER_DEFAULTS.splayLimitDeg,
    };
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
