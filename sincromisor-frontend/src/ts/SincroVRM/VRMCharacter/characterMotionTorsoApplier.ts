import { CHARACTER_IDLE_MOTION_CONFIG } from "./CharacterMotionConfig";
import type { CharacterMotionBone } from "./characterMotionBones";
import type { AiSpeechExpressionMotionProfile } from "./characterMotionExpression";
import type { SincroPoseRetargetFrame } from "./SincroPoseRetargeter";

type SharedTorsoMotion = {
    breathWave: number;
    intensity: number;
    listening: number;
    aiSpeaking: number;
    aiGesture: number;
    expression: AiSpeechExpressionMotionProfile;
    motionScale: number;
    pose?: SincroPoseRetargetFrame;
};

type ApplySpineMotionOptions = SharedTorsoMotion & {
    sideWave: number;
    backchannelNod: number;
    aiSpeechBeatDirection: number;
};

type ApplyChestMotionOptions = SharedTorsoMotion & {
    secondaryWave: number;
    backchannelNod: number;
};

type ApplyShoulderMotionOptions = SharedTorsoMotion & {
    secondaryWave: number;
};

export function applySpineMotion(
    bone: CharacterMotionBone | undefined,
    options: ApplySpineMotionOptions,
): void {
    if (!bone) {
        return;
    }
    const { expression, pose } = options;
    bone.node.rotation.set(
        bone.baseRotation.x +
            spinePitchOffset({
                breathWave: options.breathWave,
                intensity: options.intensity,
                listening: options.listening,
                backchannelNod: options.backchannelNod,
                aiSpeaking: options.aiSpeaking,
                expression,
                motionScale: options.motionScale,
            }),
        bone.baseRotation.y +
            spineYawOffset({
                sideWave: options.sideWave,
                intensity: options.intensity,
                aiGesture: options.aiGesture,
                aiSpeechBeatDirection: options.aiSpeechBeatDirection,
                motionScale: options.motionScale,
            }) +
            (pose?.upperBody.spine.y ?? 0),
        bone.baseRotation.z + (pose?.upperBody.spine.z ?? 0),
    );
}

export function applyChestMotion(
    chest: CharacterMotionBone | undefined,
    upperChest: CharacterMotionBone | undefined,
    options: ApplyChestMotionOptions,
): void {
    if (chest) {
        applyMainChestMotion(chest, options);
    }
    if (upperChest) {
        applyUpperChestMotion(upperChest, options);
    }
}

export function applyShoulderMotion(
    left: CharacterMotionBone | undefined,
    right: CharacterMotionBone | undefined,
    options: ApplyShoulderMotionOptions,
): void {
    const shoulderQuieting = 1 - options.listening * 0.35;
    const speechQuieting = 1 - options.aiSpeaking * options.expression.idleQuieting;
    if (left) {
        left.node.rotation.set(
            left.baseRotation.x,
            left.baseRotation.y,
            left.baseRotation.z -
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
                    options.motionScale -
                options.aiSpeaking * options.expression.shoulderOpenRad * options.motionScale -
                options.aiGesture *
                    CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderBeatRad *
                    options.motionScale +
                (options.pose?.upperBody.leftShoulder.z ?? 0),
        );
    }
    if (right) {
        right.node.rotation.set(
            right.baseRotation.x,
            right.baseRotation.y,
            right.baseRotation.z +
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
        );
    }
}

function spinePitchOffset(options: {
    breathWave: number;
    intensity: number;
    listening: number;
    backchannelNod: number;
    aiSpeaking: number;
    expression: AiSpeechExpressionMotionProfile;
    motionScale: number;
}): number {
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

function spineYawOffset(options: {
    sideWave: number;
    intensity: number;
    aiGesture: number;
    aiSpeechBeatDirection: number;
    motionScale: number;
}): number {
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

function applyMainChestMotion(chest: CharacterMotionBone, options: ApplyChestMotionOptions): void {
    chest.node.rotation.set(
        chest.baseRotation.x -
            options.breathWave *
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
                options.motionScale,
        chest.baseRotation.y + (options.pose?.upperBody.chest.y ?? 0),
        chest.baseRotation.z +
            options.secondaryWave *
                CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad *
                options.intensity *
                options.motionScale +
            (options.pose?.upperBody.chest.z ?? 0),
    );
}

function applyUpperChestMotion(
    upperChest: CharacterMotionBone,
    options: ApplyChestMotionOptions,
): void {
    upperChest.node.rotation.set(
        upperChest.baseRotation.x -
            options.breathWave *
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
                options.motionScale,
        upperChest.baseRotation.y,
        upperChest.baseRotation.z -
            options.secondaryWave *
                CHARACTER_IDLE_MOTION_CONFIG.breath.chestRollRad *
                0.65 *
                options.intensity *
                options.motionScale +
            options.aiSpeaking * options.expression.upperChestRollRad * options.motionScale +
            (options.pose?.upperBody.chest.z ?? 0) * 0.45,
    );
}
