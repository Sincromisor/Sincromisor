import type { SincroFaceMotionSnapshot } from "../../faceTracking/sincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../faceTracking/sincroPoseMotionSnapshot";
import {
    BEHAVIOR_TIMING,
    type CharacterBehaviorAiSpeechSnapshot,
    type CharacterBehaviorGazeSnapshot,
    type CharacterBehaviorVadSnapshot,
    type CharacterInteractionState,
    type CharacterMotionPolicySnapshot,
    type CharacterTalkMode,
} from "./characterBehaviorTypes";

type DeriveCharacterInteractionStateOptions = {
    talkMode: CharacterTalkMode;
    errorMessage?: string;
    aiSpeech: CharacterBehaviorAiSpeechSnapshot;
    vad: CharacterBehaviorVadSnapshot;
    gaze: CharacterBehaviorGazeSnapshot;
    faceMotion: SincroFaceMotionSnapshot;
    lastUserSpeechEndedAtMs?: number;
    nowMs: number;
};

type BuildCharacterMotionPolicyOptions = {
    talkMode: CharacterTalkMode;
    talkModeChangedAtMs: number;
    poseMotion: SincroPoseMotionSnapshot;
    nowMs: number;
};

export function deriveCharacterInteractionState(
    options: DeriveCharacterInteractionStateOptions,
): CharacterInteractionState {
    if (options.errorMessage) {
        return "error_or_disconnected";
    }
    if (options.aiSpeech.isSpeaking && options.talkMode === "chat") {
        return "ai_speaking";
    }
    if (options.vad.isSpeech) {
        return "user_speaking";
    }
    if (
        options.talkMode === "chat" &&
        options.lastUserSpeechEndedAtMs !== undefined &&
        options.nowMs - options.lastUserSpeechEndedAtMs <= BEHAVIOR_TIMING.thinkingHoldMs
    ) {
        return "thinking";
    }
    if (options.talkMode === "chat" && options.gaze.trackingEnabled && !options.gaze.detected) {
        return "face_lost";
    }
    if (
        options.talkMode === "sincro" &&
        options.faceMotion.trackingEnabled &&
        !options.faceMotion.detected
    ) {
        return "face_lost";
    }
    if (options.talkMode === "chat" && options.gaze.detected) {
        return "attending";
    }
    if (options.talkMode === "sincro" && options.faceMotion.detected) {
        return "attending";
    }
    return "idle";
}

export function buildCharacterMotionPolicy(
    options: BuildCharacterMotionPolicyOptions,
): CharacterMotionPolicySnapshot {
    const neutralTransition =
        options.nowMs - options.talkModeChangedAtMs <= BEHAVIOR_TIMING.modeNeutralTransitionMs;
    if (options.talkMode === "sincro") {
        return {
            talkMode: "sincro",
            primaryInput: "faceMotion",
            neutralTransition,
            allowGazeMotion: false,
            allowFaceRetarget: true,
            allowPoseRetarget:
                options.poseMotion.trackingEnabled && !options.poseMotion.degradedToFaceOnly,
            allowAiSpeechGesture: false,
            allowAiLipSync: false,
            allowAiEmotion: false,
            allowThinkingAversion: false,
            idleMotionScale: neutralTransition ? 0.25 : 0.42,
        };
    }
    return {
        talkMode: "chat",
        primaryInput: "gaze",
        neutralTransition,
        allowGazeMotion: true,
        allowFaceRetarget: false,
        allowPoseRetarget: false,
        allowAiSpeechGesture: !neutralTransition,
        allowAiLipSync: !neutralTransition,
        allowAiEmotion: !neutralTransition,
        allowThinkingAversion: !neutralTransition,
        idleMotionScale: neutralTransition ? 0.35 : 1,
    };
}
