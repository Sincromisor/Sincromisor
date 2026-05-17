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

export function getAiSpeechExpressionMotionProfile(
    expressionCode: number | undefined,
): AiSpeechExpressionMotionProfile {
    switch (expressionCode) {
        case 2:
            return {
                postureIntensity: 0.7,
                gestureIntensity: 0.58,
                idleQuieting: 0.34,
                spinePitchRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad,
                chestPitchRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestPitchRad,
                upperChestPitchRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestPitchRad,
                upperChestRollRad:
                    -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestRollRad * 0.35,
                shoulderOpenRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.45,
            };
        case 3:
            return {
                postureIntensity: 0.82,
                gestureIntensity: 0.72,
                idleQuieting: 0.55,
                spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.25,
                chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.55,
                upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.65,
                upperChestRollRad: 0,
                shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.35,
            };
        case 4:
            return {
                postureIntensity: 0.86,
                gestureIntensity: 0.82,
                idleQuieting: 0.18,
                spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.45,
                chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad,
                upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.9,
                upperChestRollRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestRollRad,
                shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad,
            };
        case 5:
            return {
                postureIntensity: 0.9,
                gestureIntensity: 0.9,
                idleQuieting: 0.4,
                spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.6,
                chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.8,
                upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad,
                upperChestRollRad: 0,
                shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.75,
            };
        case 1:
            return {
                postureIntensity: 0.58,
                gestureIntensity: 0.48,
                idleQuieting: 0.2,
                spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.2,
                chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.35,
                upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.3,
                upperChestRollRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.upperChestRollRad * 0.35,
                shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.4,
            };
        default:
            return {
                postureIntensity: 0.54,
                gestureIntensity: 0.5,
                idleQuieting: 0.26,
                spinePitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.spineLeanRad * 0.12,
                chestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.24,
                upperChestPitchRad: -CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.chestOpenRad * 0.18,
                upperChestRollRad: 0,
                shoulderOpenRad: CHARACTER_IDLE_MOTION_CONFIG.aiSpeaking.shoulderOpenRad * 0.22,
            };
    }
}
