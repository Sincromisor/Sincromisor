import { MathUtils } from "three/src/math/MathUtils.js";
import type { CharacterBehaviorSnapshot } from "./characterBehaviorState";
import { EYE_BEHAVIOR_CONFIG, type EyeTarget } from "./eyeBehaviorValues";

export type EyeTargetRuntimeState = {
    microsaccade: EyeTarget;
    nextMicrosaccadeAtMs: number;
    aversionTarget?: EyeTarget;
    aversionUntilMs: number;
    nextAversionAtMs: number;
};

type UpdateEyeTargetOptions = {
    snapshot: CharacterBehaviorSnapshot;
    nowMs: number;
    state: EyeTargetRuntimeState;
};

export function createEyeTargetRuntimeState(
    nowMs: number = performance.now(),
): EyeTargetRuntimeState {
    return {
        microsaccade: { x: 0, y: 0 },
        nextMicrosaccadeAtMs: nowMs + 900,
        aversionUntilMs: 0,
        nextAversionAtMs: nowMs + 900,
    };
}

export function updateEyeTarget(options: UpdateEyeTargetOptions): EyeTarget {
    const { snapshot, nowMs, state } = options;
    const baseTarget =
        snapshot.motionPolicy.allowGazeMotion && snapshot.gaze.detected
            ? { x: snapshot.gaze.targetX, y: snapshot.gaze.targetY }
            : { x: 0.5, y: 0.5 };
    const aversion = updateAversion(snapshot, nowMs, state);
    const microsaccade = updateMicrosaccade(snapshot, nowMs, state);
    const aiSpeechOffset = getAiSpeechEyeOffset(snapshot);

    return {
        x: MathUtils.clamp(
            baseTarget.x + aversion.x + microsaccade.x + aiSpeechOffset.x,
            0.34,
            0.66,
        ),
        y: MathUtils.clamp(
            baseTarget.y + aversion.y + microsaccade.y + aiSpeechOffset.y,
            0.38,
            0.62,
        ),
    };
}

function getAiSpeechEyeOffset(snapshot: CharacterBehaviorSnapshot): EyeTarget {
    if (!snapshot.motionPolicy.allowAiSpeechGesture || !snapshot.aiSpeech.isSpeaking) {
        return { x: 0, y: 0 };
    }
    switch (snapshot.aiSpeech.expressionCode) {
        case 2:
            return { x: -0.012, y: 0.018 };
        case 3:
            return { x: 0, y: -0.006 };
        case 4:
            return { x: 0.01, y: -0.012 };
        case 5:
            return { x: 0, y: -0.02 };
        case 1:
            return { x: 0.008, y: -0.004 };
        default:
            return { x: 0, y: -0.004 };
    }
}

function updateAversion(
    snapshot: CharacterBehaviorSnapshot,
    nowMs: number,
    state: EyeTargetRuntimeState,
): EyeTarget {
    if (
        !snapshot.motionPolicy.allowThinkingAversion ||
        snapshot.state !== "thinking" ||
        !snapshot.gaze.detected
    ) {
        state.aversionTarget = undefined;
        return { x: 0, y: 0 };
    }
    if (state.aversionTarget && nowMs <= state.aversionUntilMs) {
        return state.aversionTarget;
    }
    if (nowMs < state.nextAversionAtMs) {
        state.aversionTarget = undefined;
        return { x: 0, y: 0 };
    }

    const direction = Math.random() < 0.5 ? -1 : 1;
    state.aversionTarget = {
        x: EYE_BEHAVIOR_CONFIG.thinkingAversionOffsetX * direction,
        y: EYE_BEHAVIOR_CONFIG.thinkingAversionOffsetY * (Math.random() < 0.65 ? 1 : -0.65),
    };
    state.aversionUntilMs = nowMs + EYE_BEHAVIOR_CONFIG.thinkingAversionDurationMs;
    state.nextAversionAtMs =
        nowMs + EYE_BEHAVIOR_CONFIG.thinkingAversionMinIntervalMs + randomRange(0, 850);
    return state.aversionTarget;
}

function updateMicrosaccade(
    snapshot: CharacterBehaviorSnapshot,
    nowMs: number,
    state: EyeTargetRuntimeState,
): EyeTarget {
    if (nowMs < state.nextMicrosaccadeAtMs) {
        return state.microsaccade;
    }
    const stateIntervalScale = snapshot.state === "user_speaking" ? 1.45 : 1;
    const amplitude =
        snapshot.state === "user_speaking" || snapshot.state === "attending"
            ? EYE_BEHAVIOR_CONFIG.attentionMicrosaccadeAmplitude
            : EYE_BEHAVIOR_CONFIG.microsaccadeAmplitude;
    state.microsaccade = {
        x: randomRange(-amplitude, amplitude),
        y: randomRange(-amplitude * 0.65, amplitude * 0.65),
    };
    state.nextMicrosaccadeAtMs = nowMs + randomRange(720, 1800) * stateIntervalScale;
    return state.microsaccade;
}

function randomRange(min: number, max: number): number {
    return min + (max - min) * Math.random();
}
