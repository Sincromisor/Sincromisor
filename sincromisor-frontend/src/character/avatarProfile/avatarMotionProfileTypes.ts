/** プロファイル生成と保存データ検証が共有する契約。VRMの実行時処理には依存しない。 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";

/** 保存・再生で受理するプロファイルの版。 */
export const AVATAR_MOTION_PROFILE_SCHEMA_VERSION = "sincro.avatar-motion-profile.v1" as const;

/** 生成と検証で共有する正規化済みボーン名。未知の名前は保存データとして受理しない。 */
export const AVATAR_MOTION_PROFILE_BONE_NAMES = [
    "hips",
    "spine",
    "chest",
    "upperChest",
    "neck",
    "head",
    "leftShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightShoulder",
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
] as const satisfies readonly VRMHumanBoneName[];

/** 保存データの指名。左右はアバター自身を基準とする。 */
export type AvatarMotionFingerName = "thumb" | "index" | "middle" | "ring" | "little";
/** アバター自身を基準とした左右。 */
export type AvatarMotionSide = "left" | "right";

/** VRMの計測結果と動作補正値の保存契約。距離はメートル、回転はローカル座標の四元数とする。 */
export type AvatarMotionProfile = {
    schemaVersion: typeof AVATAR_MOTION_PROFILE_SCHEMA_VERSION;
    model: {
        vrmVersion: "1.0" | "unknown";
        modelName?: string;
    };
    capabilities: {
        bones: Partial<Record<VRMHumanBoneName, boolean>>;
        fingerChains: Record<
            AvatarMotionSide,
            Record<
                AvatarMotionFingerName,
                {
                    proximal: boolean;
                    intermediate: boolean;
                    distal: boolean;
                }
            >
        >;
    };
    restLocalRotation: Partial<Record<VRMHumanBoneName, readonly [number, number, number, number]>>;
    metrics: {
        shoulderWidth?: number;
        torsoLength?: number;
        headSize?: number;
        upperArmLength: { left?: number; right?: number };
        lowerArmLength: { left?: number; right?: number };
        handSize: { left?: number; right?: number };
    };
    torso: {
        distribution: { spine: number; chest: number; upperChest: number };
        chestFollow: number;
    };
    arm: {
        reachScale: number;
        lateralScale: number;
        verticalScale: number;
        depthCompression: number;
        elbowOutwardBias: number;
        shoulderDamping: number;
    };
    wrist: {
        wristRollInfluence: number;
        lowerArmTwistShare: number;
        handTwistShare: number;
    };
    fingers: {
        curlScale: number;
        curlMode: "grouped" | "perFinger";
        curlDistribution: { proximal: number; intermediate: number; distal: number };
        splayLimitDeg: number;
    };
    risk: {
        smallBodyLargeHead: number;
        missingUpperChest: boolean;
        missingShoulders: boolean;
        constraintRisk: number;
    };
    warnings: string[];
};

/** 保存データの検証失敗を版・構造・数値範囲に分類し、対象の経路を示す。 */
export type AvatarMotionProfileParseError = {
    code: "unknown_schema_version" | "invalid_state" | "out_of_range";
    path: string[];
    message: string;
};

/** 成功時は入力から独立したプロファイル、失敗時は検証エラーを返す。 */
export type AvatarMotionProfileParseResult =
    | { ok: true; profile: AvatarMotionProfile }
    | { ok: false; errors: AvatarMotionProfileParseError[] };
