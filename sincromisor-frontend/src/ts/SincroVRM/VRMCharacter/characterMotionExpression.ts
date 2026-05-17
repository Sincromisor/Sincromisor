import { CHARACTER_IDLE_MOTION_CONFIG } from "./CharacterMotionConfig";

export type AiSpeechExpressionMotionProfile = {
    postureIntensity: number;
    gestureIntensity: number;
    idleQuieting: number;
    spinePitchRad: number;
    chestPitchRad: number;
    upperChestPitchRad: number;
    upperChestRollRad: number;
    shoulderOpenRad: number;
};

const aiSpeaking = CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking;

const DEFAULT_AI_SPEECH_EXPRESSION_MOTION_PROFILE: AiSpeechExpressionMotionProfile = {
    postureIntensity: 0.54,
    gestureIntensity: 0.5,
    idleQuieting: 0.26,
    spinePitchRad: -aiSpeaking.spineLeanRad * 0.12,
    chestPitchRad: -aiSpeaking.chestOpenRad * 0.24,
    upperChestPitchRad: -aiSpeaking.chestOpenRad * 0.18,
    upperChestRollRad: 0,
    shoulderOpenRad: aiSpeaking.shoulderOpenRad * 0.22,
};

const AI_SPEECH_EXPRESSION_MOTION_PROFILES: Record<number, AiSpeechExpressionMotionProfile> = {
    1: {
        postureIntensity: 0.58,
        gestureIntensity: 0.48,
        idleQuieting: 0.2,
        spinePitchRad: -aiSpeaking.spineLeanRad * 0.2,
        chestPitchRad: -aiSpeaking.chestOpenRad * 0.35,
        upperChestPitchRad: -aiSpeaking.chestOpenRad * 0.3,
        upperChestRollRad: aiSpeaking.upperChestRollRad * 0.35,
        shoulderOpenRad: aiSpeaking.shoulderOpenRad * 0.4,
    },
    2: {
        postureIntensity: 0.7,
        gestureIntensity: 0.58,
        idleQuieting: 0.34,
        spinePitchRad: aiSpeaking.spineLeanRad,
        chestPitchRad: aiSpeaking.chestPitchRad,
        upperChestPitchRad: aiSpeaking.upperChestPitchRad,
        upperChestRollRad: -aiSpeaking.upperChestRollRad * 0.35,
        shoulderOpenRad: -aiSpeaking.shoulderOpenRad * 0.45,
    },
    3: {
        postureIntensity: 0.82,
        gestureIntensity: 0.72,
        idleQuieting: 0.55,
        spinePitchRad: -aiSpeaking.spineLeanRad * 0.25,
        chestPitchRad: -aiSpeaking.chestOpenRad * 0.55,
        upperChestPitchRad: -aiSpeaking.chestOpenRad * 0.65,
        upperChestRollRad: 0,
        shoulderOpenRad: aiSpeaking.shoulderOpenRad * 0.35,
    },
    4: {
        postureIntensity: 0.86,
        gestureIntensity: 0.82,
        idleQuieting: 0.18,
        spinePitchRad: -aiSpeaking.spineLeanRad * 0.45,
        chestPitchRad: -aiSpeaking.chestOpenRad,
        upperChestPitchRad: -aiSpeaking.chestOpenRad * 0.9,
        upperChestRollRad: aiSpeaking.upperChestRollRad,
        shoulderOpenRad: aiSpeaking.shoulderOpenRad,
    },
    5: {
        postureIntensity: 0.9,
        gestureIntensity: 0.9,
        idleQuieting: 0.4,
        spinePitchRad: -aiSpeaking.spineLeanRad * 0.6,
        chestPitchRad: -aiSpeaking.chestOpenRad * 0.8,
        upperChestPitchRad: -aiSpeaking.chestOpenRad,
        upperChestRollRad: 0,
        shoulderOpenRad: aiSpeaking.shoulderOpenRad * 0.75,
    },
};

export function getAiSpeechExpressionMotionProfile(
    expressionCode: number | undefined,
): AiSpeechExpressionMotionProfile {
    return (
        (expressionCode === undefined
            ? undefined
            : AI_SPEECH_EXPRESSION_MOTION_PROFILES[expressionCode]) ??
        DEFAULT_AI_SPEECH_EXPRESSION_MOTION_PROFILE
    );
}
