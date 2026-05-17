import type { SincroFaceMotionSnapshot } from "../../FaceTracking/SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../../FaceTracking/SincroPoseMotionSnapshot";
import type { ChatMessage, TelopChannelMessage } from "../../RTC/RTCMessage";

export type CharacterInteractionState =
    | "idle"
    | "attending"
    | "user_speaking"
    | "thinking"
    | "ai_speaking"
    | "face_lost"
    | "error_or_disconnected";

export type CharacterTalkMode = "chat" | "sincro";

export type CharacterMotionPrimaryInput = "gaze" | "faceMotion";

export type CharacterMotionPolicySnapshot = {
    talkMode: CharacterTalkMode;
    primaryInput: CharacterMotionPrimaryInput;
    neutralTransition: boolean;
    allowGazeMotion: boolean;
    allowFaceRetarget: boolean;
    allowPoseRetarget: boolean;
    allowAiSpeechGesture: boolean;
    allowAiLipSync: boolean;
    allowAiEmotion: boolean;
    allowThinkingAversion: boolean;
    idleMotionScale: number;
};

export type CharacterBehaviorVadSnapshot = {
    isSpeech: boolean;
    rawIsSpeech: boolean;
    rms: number;
    peak: number;
    envelopeRms: number;
    envelopePeak: number;
    speechStartedAtMs?: number;
    lastSpeechEndedAtMs?: number;
    lastSpeechDurationMs: number;
    lastSpeechAtMs?: number;
    lastUpdatedAtMs?: number;
};

export type CharacterBehaviorGazeSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    rawDetected: boolean;
    targetX: number;
    targetY: number;
    facing: number;
    detectionCount: number;
    lastDetectedAtMs?: number;
    lastUpdatedAtMs?: number;
};

export type CharacterBehaviorAiSpeechSnapshot = {
    isSpeaking: boolean;
    speechId?: number;
    currentMoraId?: number;
    expressionCode?: number;
    currentVowel?: string;
    currentText?: string;
    currentLengthSeconds: number;
    beatId: number;
    beatKind?: CharacterBehaviorAiSpeechBeatKind;
    beatText?: string;
    beatIntensity: number;
    lastBeatAtMs?: number;
    lastTextMessage?: ChatMessage;
    lastTelopMessage?: TelopChannelMessage;
    lastStartedAtMs?: number;
    lastUpdatedAtMs?: number;
    lastEndedAtMs?: number;
};

export type CharacterBehaviorAiSpeechBeatKind =
    | "speech_start"
    | "cadence"
    | "phrase"
    | "punctuation";

export type CharacterBehaviorSnapshot = {
    talkMode: CharacterTalkMode;
    motionPolicy: CharacterMotionPolicySnapshot;
    state: CharacterInteractionState;
    previousState: CharacterInteractionState;
    stateChangedAtMs: number;
    nowMs: number;
    vad: CharacterBehaviorVadSnapshot;
    gaze: CharacterBehaviorGazeSnapshot;
    faceMotion: SincroFaceMotionSnapshot;
    poseMotion: SincroPoseMotionSnapshot;
    aiSpeech: CharacterBehaviorAiSpeechSnapshot;
    errorMessage?: string;
};

export const BEHAVIOR_TIMING = {
    vadAttack: 0.45,
    vadRelease: 0.12,
    vadOnsetDebounceMs: 240,
    vadMinimumMeaningfulSpeechMs: 650,
    vadSpeechHoldMs: 420,
    aiSpeechHoldMs: 360,
    aiSpeechCadenceBeatMs: 680,
    aiSpeechPhrasePauseSeconds: 0.24,
    thinkingHoldMs: 1600,
    gazeStaleMs: 1200,
    modeNeutralTransitionMs: 420,
} as const;
