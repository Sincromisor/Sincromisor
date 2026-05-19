import { MathUtils } from "three/src/math/MathUtils.js";
import type { CharacterBehaviorSnapshot } from "./characterBehaviorTypes";
import { CHARACTER_IDLE_MOTION_CONFIG } from "./characterMotionConfig";

export type ArmSpeechExpressionProfile = {
    intensityScale: number;
    liftScale: number;
    openScale: number;
    flexScale: number;
    wristScale: number;
};

export class ArmSpeechGestureState {
    private lastSpeechBeatId = 0;
    private speechGestureStartedAtSeconds: number | undefined;
    private speechGestureIntensity = 0;
    private speechGestureSide: -1 | 1 = 1;

    get side(): -1 | 1 {
        return this.speechGestureSide;
    }

    update(elapsedSeconds: number, snapshot: CharacterBehaviorSnapshot): number {
        if (shouldStartSpeechGesture(snapshot, this.lastSpeechBeatId)) {
            this.lastSpeechBeatId = snapshot.aiSpeech.beatId;
            this.speechGestureStartedAtSeconds = elapsedSeconds;
            this.speechGestureSide *= -1;
            this.speechGestureIntensity = computeSpeechGestureIntensity(snapshot);
        }
        if (this.speechGestureStartedAtSeconds === undefined) {
            return 0;
        }
        const progress =
            (elapsedSeconds - this.speechGestureStartedAtSeconds) /
            CHARACTER_IDLE_MOTION_CONFIG.arms.speechGestureDurationSeconds;
        if (
            progress >= 1 ||
            !snapshot.aiSpeech.isSpeaking ||
            !snapshot.motionPolicy.allowAiSpeechGesture
        ) {
            this.speechGestureStartedAtSeconds = undefined;
            return 0;
        }
        return Math.sin(Math.PI * MathUtils.clamp(progress, 0, 1)) * this.speechGestureIntensity;
    }
}

export function getArmSpeechExpressionProfile(
    expressionCode: number | undefined,
): ArmSpeechExpressionProfile {
    switch (expressionCode) {
        case 2:
            return {
                intensityScale: 0.58,
                liftScale: 0.45,
                openScale: 0.34,
                flexScale: 0.55,
                wristScale: 0.45,
            };
        case 3:
            return {
                intensityScale: 0.74,
                liftScale: 0.58,
                openScale: 0.38,
                flexScale: 0.82,
                wristScale: 0.55,
            };
        case 4:
            return {
                intensityScale: 0.86,
                liftScale: 0.92,
                openScale: 1.0,
                flexScale: 0.78,
                wristScale: 0.82,
            };
        case 5:
            return {
                intensityScale: 0.9,
                liftScale: 1.0,
                openScale: 0.86,
                flexScale: 0.62,
                wristScale: 1.0,
            };
        case 1:
            return {
                intensityScale: 0.48,
                liftScale: 0.42,
                openScale: 0.5,
                flexScale: 0.42,
                wristScale: 0.56,
            };
        default:
            return {
                intensityScale: 0.52,
                liftScale: 0.55,
                openScale: 0.52,
                flexScale: 0.5,
                wristScale: 0.52,
            };
    }
}

function computeSpeechGestureIntensity(snapshot: CharacterBehaviorSnapshot): number {
    const expression = getArmSpeechExpressionProfile(snapshot.aiSpeech.expressionCode);
    return MathUtils.clamp(
        snapshot.aiSpeech.beatIntensity * expression.intensityScale * getBeatKindScale(snapshot),
        0,
        1,
    );
}

function getBeatKindScale(snapshot: CharacterBehaviorSnapshot): number {
    if (snapshot.aiSpeech.beatKind === "speech_start") {
        return 1;
    }
    if (snapshot.aiSpeech.beatKind === "punctuation") {
        return 0.45;
    }
    return 0.72;
}

function shouldStartSpeechGesture(
    snapshot: CharacterBehaviorSnapshot,
    lastSpeechBeatId: number,
): boolean {
    return (
        snapshot.motionPolicy.allowAiSpeechGesture &&
        snapshot.aiSpeech.isSpeaking &&
        snapshot.aiSpeech.beatId !== lastSpeechBeatId &&
        snapshot.aiSpeech.beatIntensity > 0
    );
}
