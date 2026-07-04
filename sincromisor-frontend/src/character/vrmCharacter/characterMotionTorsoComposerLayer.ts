import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroPoseRetargetFrame } from "../retargeting/sincroPoseRetargeter";
import { composeVrmPose } from "../vrmPose/vrmPoseComposer";
import type {
    VrmPoseComposerResult,
    VrmPoseLayer,
    VrmPoseQuaternion,
} from "../vrmPose/vrmPoseTypes";
import type { CharacterMotionBone } from "./characterMotionBones";
import { CHARACTER_IDLE_MOTION_CONFIG } from "./characterMotionConfig";
import type { AiSpeechExpressionMotionProfile } from "./characterMotionExpression";

type TorsoDistribution = MinimalAvatarMotionProfile["torso"]["distribution"];

/**
 * torso / shoulder composer layer が読む orchestrator motion scalar。
 *
 * `CharacterMotionOrchestrator` の authored idle / listening / AI speech motion と pose retarget frame を
 * plain data として渡す。VRM node は含めず、base rotation と capability は別 input に分離する。
 */
export type CharacterMotionTorsoShoulderMotionInput = {
    breathWave: number;
    secondaryWave: number;
    sideWave: number;
    intensity: number;
    listening: number;
    backchannelNod: number;
    aiSpeaking: number;
    aiGesture: number;
    aiSpeechBeatDirection: number;
    expression: AiSpeechExpressionMotionProfile;
    motionScale: number;
    pose?: SincroPoseRetargetFrame;
};

/**
 * torso / shoulder selected-bone composer application の入力境界。
 *
 * `bones` は captured normalized bone node と base rotation、`profile` は optional bone と torso distribution の
 * 正本である。欠損 bone は layer 生成時に無視または composer suppression へ落とし、head / neck / leg /
 * expression / finger はこの境界へ入れない。
 */
export type CharacterMotionTorsoShoulderComposerInput = {
    bones: ReadonlyMap<string, CharacterMotionBone | undefined>;
    motion: CharacterMotionTorsoShoulderMotionInput;
    profile: MinimalAvatarMotionProfile;
};

/**
 * selected-bone runtime application 用に合成済み composer result と rollback warning を返す。
 *
 * caller は `result.finalPose` のうち torso / shoulder と missing shoulder fallback の upperArm だけを適用する。
 * `warnings` は invalid distribution や owned-bone conflict を Debug Console summary へ渡すための短い reason code。
 */
export type CharacterMotionTorsoShoulderComposerApplicationResult = {
    result: VrmPoseComposerResult;
    warnings: string[];
};

const TORSO_SHOULDER_OWNED_BONES: VRMHumanBoneName[] = [
    "spine",
    "chest",
    "upperChest",
    "leftShoulder",
    "rightShoulder",
];

/**
 * `CharacterMotionTorsoApplier` 相当の torso / shoulder 入力を composer layer に変換する。
 *
 * 入力境界は orchestrator が既に持つ authored motion scalar、retarget frame、captured base rotation、
 * `MinimalAvatarMotionProfile` に限定する。`AvatarMotionProfile.torso.distribution` 由来の
 * minimal profile distribution を torso 分配の正本にし、optional bone が欠損しても layer 生成では throw しない。
 * head / neck / leg / expression / finger は owned bone に含めない。
 */
export function createTorsoShoulderComposerLayer(
    input: CharacterMotionTorsoShoulderComposerInput,
): { layer: VrmPoseLayer; warnings: string[] } {
    const distribution = resolveTorsoDistribution(input.profile);
    const pose = createTorsoShoulderPose(input, distribution.distribution);
    return {
        layer: {
            id: "production:torso-shoulder",
            kind: "tracking",
            blendMode: "override",
            weight: 1,
            pose,
            ownedBones: [...TORSO_SHOULDER_OWNED_BONES],
        },
        warnings: distribution.warnings,
    };
}

/**
 * torso / shoulder composer layer を合成し、runtime が selected bone だけへ適用できる result にする。
 *
 * `composeVrmPose()` の full `finalPose` は返すが、caller は torso / shoulder と missing shoulder fallback の
 * upperArm だけを読む。`vrm.humanoid.setNormalizedPose()` は呼ばず、direct controller rollback は caller が
 * `warnings` を見て判断する。
 */
export function composeTorsoShoulderApplication(
    input: CharacterMotionTorsoShoulderComposerInput,
): CharacterMotionTorsoShoulderComposerApplicationResult {
    const { layer, warnings } = createTorsoShoulderComposerLayer(input);
    const result = composeVrmPose({
        layers: [layer],
        profile: input.profile,
    });
    return {
        result,
        warnings: [...warnings, ...result.warnings],
    };
}

function createTorsoShoulderPose(
    input: CharacterMotionTorsoShoulderComposerInput,
    distribution: TorsoDistribution,
): Partial<Record<VRMHumanBoneName, VrmPoseQuaternion>> {
    const torso = createDistributedTorsoOffsets(input.motion, distribution);
    return {
        spine: boneQuaternion(input.bones.get("spine"), torso.spine),
        chest: boneQuaternion(input.bones.get("chest"), torso.chest),
        upperChest: boneQuaternion(input.bones.get("upperChest"), torso.upperChest),
        leftShoulder: boneQuaternion(
            input.bones.get("leftShoulder") ?? input.bones.get("leftUpperArm"),
            leftShoulderOffset(input.motion),
        ),
        rightShoulder: boneQuaternion(
            input.bones.get("rightShoulder") ?? input.bones.get("rightUpperArm"),
            rightShoulderOffset(input.motion),
        ),
    };
}

function createDistributedTorsoOffsets(
    motion: CharacterMotionTorsoShoulderMotionInput,
    distribution: TorsoDistribution,
): Record<"spine" | "chest" | "upperChest", { x: number; y: number; z: number }> {
    const pitch =
        spinePitchOffset(motion) + mainChestPitchOffset(motion) + upperChestPitchOffset(motion);
    const yaw =
        spineYawOffset(motion) +
        (motion.pose?.upperBody.spine.y ?? 0) +
        (motion.pose?.upperBody.chest.y ?? 0);
    const roll =
        (motion.pose?.upperBody.spine.z ?? 0) +
        mainChestRollOffset(motion) +
        upperChestRollOffset(motion);
    return {
        spine: {
            x: pitch * distribution.spine,
            y: yaw * distribution.spine,
            z: roll * distribution.spine,
        },
        chest: {
            x: pitch * distribution.chest,
            y: yaw * distribution.chest,
            z: roll * distribution.chest,
        },
        upperChest: {
            x: pitch * distribution.upperChest,
            y: yaw * distribution.upperChest,
            z: roll * distribution.upperChest,
        },
    };
}

function resolveTorsoDistribution(profile: MinimalAvatarMotionProfile): {
    distribution: TorsoDistribution;
    warnings: string[];
} {
    const profileDistribution = profile.torso.distribution;
    if (isValidDistribution(profileDistribution)) {
        return { distribution: profileDistribution, warnings: [] };
    }
    return {
        distribution: defaultTorsoDistribution(profile),
        warnings: ["invalid_torso_distribution_profile_defaulted"],
    };
}

function isValidDistribution(distribution: TorsoDistribution): boolean {
    const values = [distribution.spine, distribution.chest, distribution.upperChest];
    return (
        values.every((value) => Number.isFinite(value) && value >= 0) &&
        Math.abs(values.reduce((sum, value) => sum + value, 0) - 1) <= 0.001
    );
}

function defaultTorsoDistribution(profile: MinimalAvatarMotionProfile): TorsoDistribution {
    if (profile.optionalBones.upperChest) {
        return { spine: 0.25, chest: 0.4, upperChest: 0.35 };
    }
    return { spine: 0.35, chest: 0.65, upperChest: 0 };
}

function boneQuaternion(
    bone: CharacterMotionBone | undefined,
    offset: { x: number; y: number; z: number },
): VrmPoseQuaternion | undefined {
    if (!bone) {
        return undefined;
    }
    const quaternion = new Quaternion().setFromEuler(
        new Euler(
            bone.baseRotation.x + offset.x,
            bone.baseRotation.y + offset.y,
            bone.baseRotation.z + offset.z,
            "XYZ",
        ),
    );
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

function spinePitchOffset(options: CharacterMotionTorsoShoulderMotionInput): number {
    return (
        -options.breathWave *
            CHARACTER_IDLE_MOTION_CONFIG.breath.spinePitchRad *
            options.intensity *
            options.motionScale -
        options.listening *
            CHARACTER_IDLE_MOTION_CONFIG.listening.spineLeanRad *
            options.motionScale -
        options.backchannelNod *
            CHARACTER_IDLE_MOTION_CONFIG.listening.nodSpinePitchRad *
            options.motionScale +
        options.aiSpeaking * options.expression.spinePitchRad * options.motionScale
    );
}

function spineYawOffset(options: CharacterMotionTorsoShoulderMotionInput): number {
    return (
        options.sideWave *
            CHARACTER_IDLE_MOTION_CONFIG.balance.spineYawRad *
            options.intensity *
            options.motionScale +
        options.aiGesture *
            options.aiSpeechBeatDirection *
            CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineBeatYawRad *
            options.motionScale
    );
}

function mainChestPitchOffset(options: CharacterMotionTorsoShoulderMotionInput): number {
    return (
        -options.breathWave *
            CHARACTER_IDLE_MOTION_CONFIG.breath.chestPitchRad *
            options.intensity *
            options.motionScale -
        options.listening *
            CHARACTER_IDLE_MOTION_CONFIG.listening.chestLeanRad *
            options.motionScale -
        options.backchannelNod *
            CHARACTER_IDLE_MOTION_CONFIG.listening.nodChestPitchRad *
            options.motionScale +
        options.aiSpeaking * options.expression.chestPitchRad * options.motionScale -
        options.aiGesture *
            CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestBeatPitchRad *
            options.motionScale
    );
}

function upperChestPitchOffset(options: CharacterMotionTorsoShoulderMotionInput): number {
    return (
        -options.breathWave *
            CHARACTER_IDLE_MOTION_CONFIG.breath.upperChestPitchRad *
            options.intensity *
            options.motionScale -
        options.listening *
            CHARACTER_IDLE_MOTION_CONFIG.listening.upperChestLeanRad *
            options.motionScale -
        options.backchannelNod *
            CHARACTER_IDLE_MOTION_CONFIG.listening.nodChestPitchRad *
            0.55 *
            options.motionScale +
        options.aiSpeaking * options.expression.upperChestPitchRad * options.motionScale -
        options.aiGesture *
            CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestBeatPitchRad *
            0.65 *
            options.motionScale
    );
}

function mainChestRollOffset(options: CharacterMotionTorsoShoulderMotionInput): number {
    return (
        options.secondaryWave *
            CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad *
            options.intensity *
            options.motionScale +
        (options.pose?.upperBody.chest.z ?? 0)
    );
}

function upperChestRollOffset(options: CharacterMotionTorsoShoulderMotionInput): number {
    return (
        -options.secondaryWave *
            CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad *
            0.65 *
            options.intensity *
            options.motionScale +
        options.aiSpeaking * options.expression.upperChestRollRad * options.motionScale +
        (options.pose?.upperBody.chest.z ?? 0) * 0.45
    );
}

function leftShoulderOffset(options: CharacterMotionTorsoShoulderMotionInput): {
    x: number;
    y: number;
    z: number;
} {
    const shoulderQuieting = 1 - options.listening * 0.35;
    const speechQuieting = 1 - options.aiSpeaking * options.expression.idleQuieting;
    return {
        x: 0,
        y: 0,
        z:
            -options.breathWave *
                CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad *
                options.intensity *
                shoulderQuieting *
                options.motionScale +
            options.secondaryWave *
                CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad *
                options.intensity *
                shoulderQuieting *
                speechQuieting *
                options.motionScale -
            options.aiSpeaking * options.expression.shoulderOpenRad * options.motionScale -
            options.aiGesture *
                CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderBeatRad *
                options.motionScale +
            (options.pose?.upperBody.leftShoulder.z ?? 0),
    };
}

function rightShoulderOffset(options: CharacterMotionTorsoShoulderMotionInput): {
    x: number;
    y: number;
    z: number;
} {
    const shoulderQuieting = 1 - options.listening * 0.35;
    const speechQuieting = 1 - options.aiSpeaking * options.expression.idleQuieting;
    return {
        x: 0,
        y: 0,
        z:
            options.breathWave *
                CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderLiftRad *
                options.intensity *
                shoulderQuieting *
                options.motionScale +
            options.secondaryWave *
                CHARACTER_IDLE_MOTION_CONFIG.breath.shoulderRollRad *
                options.intensity *
                shoulderQuieting *
                speechQuieting *
                options.motionScale +
            options.aiSpeaking * options.expression.shoulderOpenRad * options.motionScale +
            options.aiGesture *
                CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderBeatRad *
                options.motionScale +
            (options.pose?.upperBody.rightShoulder.z ?? 0),
    };
}
