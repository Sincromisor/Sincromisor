import type { Detection } from "@mediapipe/tasks-vision";
import type { CharacterGaze } from "../../CharacterGaze/CharacterGaze";
import type { SincroFaceMotionSnapshot } from "../../FaceTracking/SincroFaceMotionSnapshot";
import { DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT } from "../../FaceTracking/SincroFaceMotionSnapshot";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
} from "../../FaceTracking/SincroPoseMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
} from "../../FaceTracking/SincroPoseMotionSnapshot";
import type { ChatMessage, TelopChannelMessage } from "../../RTC/RTCMessage";
import { TalkManager, type TalkManagerEvent } from "../../RTC/TalkManager";
import type { VadStateReport } from "../../RTC/UserMediaManager";

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

const BEHAVIOR_TIMING = {
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

// キャラクター表現が参照する入力状態の集約点。
// ボーン/表情 controller が個別に TalkManager や Gaze を購読し続けるとタイミング調整が分散するため、
// 後続の姿勢・目線・発話同期モーションはこの snapshot を正本として参照する。
export class CharacterBehaviorState {
    private static instance: CharacterBehaviorState;
    private talkMode: CharacterTalkMode = "chat";
    private talkModeChangedAtMs = performance.now();
    private previousState: CharacterInteractionState = "idle";
    private state: CharacterInteractionState = "idle";
    private stateChangedAtMs = performance.now();
    private errorMessage: string | undefined;
    private readonly errorMessagesBySource = new Map<string, string>();
    private readonly expressionCodeBySpeechId = new Map<number, number>();
    private lastUserSpeechEndedAtMs: number | undefined;
    private pendingRawSpeechStartedAtMs: number | undefined;
    private vad: CharacterBehaviorVadSnapshot = {
        isSpeech: false,
        rawIsSpeech: false,
        rms: 0,
        peak: 0,
        envelopeRms: 0,
        envelopePeak: 0,
        lastSpeechDurationMs: 0,
    };
    private gaze: CharacterBehaviorGazeSnapshot = {
        trackingEnabled: false,
        detected: false,
        rawDetected: false,
        targetX: 0.5,
        targetY: 0.5,
        facing: 0.5,
        detectionCount: 0,
    };
    private faceMotion: SincroFaceMotionSnapshot = {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
        blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
    };
    private poseMotion: SincroPoseMotionSnapshot = {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        upperBody: { ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody },
        leftArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
        rightArm: { ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT },
    };
    private aiSpeech: CharacterBehaviorAiSpeechSnapshot = {
        isSpeaking: false,
        currentLengthSeconds: 0,
        beatId: 0,
        beatIntensity: 0,
    };

    static getManager(): CharacterBehaviorState {
        if (!CharacterBehaviorState.instance) {
            CharacterBehaviorState.instance = new CharacterBehaviorState();
        }
        return CharacterBehaviorState.instance;
    }

    private constructor() {
        TalkManager.getManager().subscribe((event) => {
            this.applyTalkManagerEvent(event);
        });
    }

    applyVadState(report: VadStateReport, nowMs: number = performance.now()): void {
        const rms = Math.max(0, Number(report.rms) || 0);
        const peak = Math.max(0, Number(report.peak) || 0);
        const wasSpeech = this.vad.isSpeech;
        const envelopeRms = this.smoothEnvelope(this.vad.envelopeRms, rms);
        const envelopePeak = this.smoothEnvelope(this.vad.envelopePeak, peak);
        if (report.isSpeech && this.pendingRawSpeechStartedAtMs === undefined) {
            this.pendingRawSpeechStartedAtMs = nowMs;
        }
        if (!report.isSpeech && !wasSpeech) {
            this.pendingRawSpeechStartedAtMs = undefined;
        }
        const rawSpeechAgeMs =
            this.pendingRawSpeechStartedAtMs === undefined
                ? 0
                : nowMs - this.pendingRawSpeechStartedAtMs;
        const acceptedRawSpeech =
            report.isSpeech && rawSpeechAgeMs >= BEHAVIOR_TIMING.vadOnsetDebounceMs;
        const lastSpeechAtMs = report.isSpeech ? nowMs : this.vad.lastSpeechAtMs;
        const isSpeech =
            acceptedRawSpeech ||
            (wasSpeech &&
                lastSpeechAtMs !== undefined &&
                nowMs - lastSpeechAtMs <= BEHAVIOR_TIMING.vadSpeechHoldMs);
        const speechStartedAtMs = isSpeech
            ? (this.vad.speechStartedAtMs ?? this.pendingRawSpeechStartedAtMs ?? nowMs)
            : undefined;
        const speechDurationMs = wasSpeech ? nowMs - (this.vad.speechStartedAtMs ?? nowMs) : 0;
        const completedMeaningfulSpeech =
            speechDurationMs >= BEHAVIOR_TIMING.vadMinimumMeaningfulSpeechMs;
        const lastSpeechEndedAtMs =
            wasSpeech && !isSpeech && completedMeaningfulSpeech
                ? nowMs
                : this.vad.lastSpeechEndedAtMs;
        const lastSpeechDurationMs =
            wasSpeech && !isSpeech ? speechDurationMs : this.vad.lastSpeechDurationMs;

        if (wasSpeech && !isSpeech && completedMeaningfulSpeech) {
            this.lastUserSpeechEndedAtMs = nowMs;
        }
        if (wasSpeech && !isSpeech) {
            this.pendingRawSpeechStartedAtMs = report.isSpeech ? nowMs : undefined;
        }

        this.vad = {
            isSpeech,
            rawIsSpeech: report.isSpeech,
            rms,
            peak,
            envelopeRms,
            envelopePeak,
            speechStartedAtMs,
            lastSpeechEndedAtMs,
            lastSpeechDurationMs,
            lastSpeechAtMs,
            lastUpdatedAtMs: nowMs,
        };
    }

    applyGazeState(
        characterGaze: CharacterGaze,
        detections: Detection[],
        nowMs: number = performance.now(),
    ): void {
        const rawDetected = detections.length > 0;
        const detected = characterGaze.detecting();
        this.gaze = {
            trackingEnabled: true,
            detected,
            rawDetected,
            targetX: characterGaze.targetX(),
            targetY: characterGaze.targetY(),
            facing: characterGaze.facing(),
            detectionCount: detections.length,
            lastDetectedAtMs: detected ? nowMs : this.gaze.lastDetectedAtMs,
            lastUpdatedAtMs: nowMs,
        };
    }

    setGazeTrackingEnabled(enabled: boolean, nowMs: number = performance.now()): void {
        this.gaze = {
            ...this.gaze,
            trackingEnabled: enabled,
            rawDetected: enabled ? this.gaze.rawDetected : false,
            detected: enabled ? this.gaze.detected : false,
            detectionCount: enabled ? this.gaze.detectionCount : 0,
            lastUpdatedAtMs: nowMs,
        };
    }

    applyFaceMotion(snapshot: SincroFaceMotionSnapshot, nowMs: number = performance.now()): void {
        this.faceMotion = {
            ...snapshot,
            headPose: { ...snapshot.headPose },
            blendshapes: { ...snapshot.blendshapes },
            lastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? nowMs,
        };
    }

    applyPoseMotion(snapshot: SincroPoseMotionSnapshot, nowMs: number = performance.now()): void {
        this.poseMotion = {
            ...snapshot,
            upperBody: { ...snapshot.upperBody },
            leftArm: clonePoseArmMotion(snapshot.leftArm),
            rightArm: clonePoseArmMotion(snapshot.rightArm),
            lastUpdatedAtMs: snapshot.lastUpdatedAtMs ?? nowMs,
        };
    }

    setTalkMode(mode: string, nowMs: number = performance.now()): void {
        const nextMode = this.normalizeTalkMode(mode);
        if (nextMode === this.talkMode) {
            return;
        }

        this.talkMode = nextMode;
        this.talkModeChangedAtMs = nowMs;
        this.lastUserSpeechEndedAtMs = undefined;
        this.pendingRawSpeechStartedAtMs = undefined;

        // mode切替直後は古い入力状態を残さない。trackerの実停止/起動はApp層が担当する。
        if (nextMode === "sincro") {
            this.setGazeTrackingEnabled(false, nowMs);
        } else {
            this.setFaceMotionTrackingEnabled(false, nowMs);
            this.setPoseMotionTrackingEnabled(false, nowMs);
        }
        this.update(nowMs);
    }

    setFaceMotionTrackingEnabled(enabled: boolean, nowMs: number = performance.now()): void {
        this.faceMotion = {
            ...this.faceMotion,
            trackingEnabled: enabled,
            detected: enabled ? this.faceMotion.detected : false,
            confidence: enabled ? this.faceMotion.confidence : 0,
            fallbackReason: enabled ? this.faceMotion.fallbackReason : null,
            lastUpdatedAtMs: nowMs,
        };
    }

    setPoseMotionTrackingEnabled(enabled: boolean, nowMs: number = performance.now()): void {
        this.poseMotion = {
            ...this.poseMotion,
            trackingEnabled: enabled,
            detected: enabled ? this.poseMotion.detected : false,
            confidence: enabled ? this.poseMotion.confidence : 0,
            fallbackReason: enabled ? this.poseMotion.fallbackReason : null,
            degradedToFaceOnly: enabled ? this.poseMotion.degradedToFaceOnly : false,
            lastUpdatedAtMs: nowMs,
        };
    }

    setError(message: string | undefined, nowMs: number = performance.now()): void {
        if (message === undefined) {
            this.clearErrorSource("general", nowMs);
            return;
        }
        this.setErrorSource("general", message, nowMs);
    }

    setErrorSource(source: string, message: string, nowMs: number = performance.now()): void {
        if (message) {
            this.errorMessagesBySource.set(source, message);
        } else {
            this.errorMessagesBySource.delete(source);
        }
        this.errorMessage = this.currentErrorMessage();
        this.update(nowMs);
    }

    clearErrorSource(source: string, nowMs: number = performance.now()): void {
        this.errorMessagesBySource.delete(source);
        this.errorMessage = this.currentErrorMessage();
        this.update(nowMs);
    }

    update(nowMs: number = performance.now()): CharacterBehaviorSnapshot {
        this.refreshGazeStaleness(nowMs);
        this.refreshAiSpeechFromCurrentMora(nowMs);
        const nextState = this.deriveState(nowMs);
        if (nextState !== this.state) {
            this.previousState = this.state;
            this.state = nextState;
            this.stateChangedAtMs = nowMs;
        }
        return this.getSnapshot(nowMs);
    }

    getSnapshot(nowMs: number = performance.now()): CharacterBehaviorSnapshot {
        const motionPolicy = this.buildMotionPolicy(nowMs);
        return {
            talkMode: this.talkMode,
            motionPolicy,
            state: this.state,
            previousState: this.previousState,
            stateChangedAtMs: this.stateChangedAtMs,
            nowMs,
            vad: { ...this.vad },
            gaze: { ...this.gaze },
            faceMotion: {
                ...this.faceMotion,
                headPose: { ...this.faceMotion.headPose },
                blendshapes: { ...this.faceMotion.blendshapes },
            },
            poseMotion: {
                ...this.poseMotion,
                upperBody: { ...this.poseMotion.upperBody },
                leftArm: clonePoseArmMotion(this.poseMotion.leftArm),
                rightArm: clonePoseArmMotion(this.poseMotion.rightArm),
            },
            aiSpeech: { ...this.aiSpeech },
            errorMessage: this.errorMessage,
        };
    }

    private applyTalkManagerEvent(event: TalkManagerEvent): void {
        const nowMs = performance.now();
        if (event.type === "text_channel_message") {
            this.applyTextChannelMessage(event.message, nowMs);
            return;
        }
        this.applyTelopChannelMessage(event.message, nowMs);
    }

    private applyTextChannelMessage(message: ChatMessage, nowMs: number): void {
        if (message.message_type !== "system") {
            return;
        }
        const expressionCode =
            typeof message.expression_code === "number" ? message.expression_code : undefined;
        if (expressionCode === undefined) {
            this.expressionCodeBySpeechId.delete(message.speech_id);
        } else {
            this.expressionCodeBySpeechId.set(message.speech_id, expressionCode);
        }
        const shouldApplyToCurrentSpeech =
            this.aiSpeech.speechId === undefined ||
            this.aiSpeech.speechId === message.speech_id ||
            !this.aiSpeech.isSpeaking;
        this.aiSpeech = {
            ...this.aiSpeech,
            speechId: shouldApplyToCurrentSpeech ? message.speech_id : this.aiSpeech.speechId,
            expressionCode: shouldApplyToCurrentSpeech
                ? expressionCode
                : this.aiSpeech.expressionCode,
            lastTextMessage: message,
            lastUpdatedAtMs: nowMs,
        };
    }

    private applyTelopChannelMessage(message: TelopChannelMessage, nowMs: number): void {
        const speechChanged = this.aiSpeech.speechId !== message.speech_id;
        const wasSpeaking = this.aiSpeech.isSpeaking && !speechChanged;
        const beat = this.nextAiSpeechBeat(message, nowMs);
        this.aiSpeech = {
            ...this.aiSpeech,
            isSpeaking: true,
            speechId: message.speech_id,
            currentMoraId: message.new_text
                ? (this.aiSpeech.currentMoraId ?? -1) + 1
                : this.aiSpeech.currentMoraId,
            expressionCode: speechChanged
                ? this.expressionCodeForSpeech(message.speech_id)
                : this.aiSpeech.expressionCode,
            currentVowel: nonEmptyStringOrUndefined(message.vowel),
            currentText: nonEmptyStringOrUndefined(message.text),
            currentLengthSeconds: Math.max(0, Number(message.length) || 0),
            beatId: beat ? this.aiSpeech.beatId + 1 : this.aiSpeech.beatId,
            beatKind: beat?.kind ?? (speechChanged ? undefined : this.aiSpeech.beatKind),
            beatText: beat?.text ?? (speechChanged ? undefined : this.aiSpeech.beatText),
            beatIntensity: beat?.intensity ?? (speechChanged ? 0 : this.aiSpeech.beatIntensity),
            lastBeatAtMs: beat ? nowMs : this.aiSpeech.lastBeatAtMs,
            lastTelopMessage: message,
            lastStartedAtMs: wasSpeaking ? this.aiSpeech.lastStartedAtMs : nowMs,
            lastUpdatedAtMs: nowMs,
            lastEndedAtMs: undefined,
        };
    }

    private refreshAiSpeechFromCurrentMora(nowMs: number): void {
        const currentMora = TalkManager.getManager().currentMora();
        const lastUpdatedAtMs = this.aiSpeech.lastUpdatedAtMs;
        const heldByRecentTelop =
            lastUpdatedAtMs !== undefined &&
            nowMs - lastUpdatedAtMs <= BEHAVIOR_TIMING.aiSpeechHoldMs;
        const isSpeaking = currentMora !== undefined || heldByRecentTelop;
        if (isSpeaking) {
            const currentSpeechId = currentMora?.mora.speech_id ?? this.aiSpeech.speechId;
            this.aiSpeech = {
                ...this.aiSpeech,
                isSpeaking: true,
                speechId: currentSpeechId,
                currentMoraId: currentMora?.moraID ?? this.aiSpeech.currentMoraId,
                expressionCode:
                    currentSpeechId === undefined
                        ? this.aiSpeech.expressionCode
                        : this.expressionCodeForSpeech(currentSpeechId),
                currentVowel:
                    nonEmptyStringOrUndefined(currentMora?.mora.vowel) ??
                    this.aiSpeech.currentVowel,
                currentText:
                    nonEmptyStringOrUndefined(currentMora?.mora.text) ?? this.aiSpeech.currentText,
                currentLengthSeconds: currentMora
                    ? Math.max(0, Number(currentMora.mora.length) || 0)
                    : this.aiSpeech.currentLengthSeconds,
                lastUpdatedAtMs: currentMora ? nowMs : this.aiSpeech.lastUpdatedAtMs,
                lastEndedAtMs: undefined,
            };
            return;
        }
        if (this.aiSpeech.isSpeaking) {
            this.aiSpeech = {
                ...this.aiSpeech,
                isSpeaking: false,
                currentVowel: undefined,
                currentText: undefined,
                currentLengthSeconds: 0,
                currentMoraId: undefined,
                beatKind: undefined,
                beatText: undefined,
                beatIntensity: 0,
                lastEndedAtMs: nowMs,
            };
        }
    }

    private deriveState(nowMs: number): CharacterInteractionState {
        if (this.errorMessage) {
            return "error_or_disconnected";
        }
        if (this.aiSpeech.isSpeaking && this.talkMode === "chat") {
            return "ai_speaking";
        }
        if (this.vad.isSpeech) {
            return "user_speaking";
        }
        if (
            this.talkMode === "chat" &&
            this.lastUserSpeechEndedAtMs !== undefined &&
            nowMs - this.lastUserSpeechEndedAtMs <= BEHAVIOR_TIMING.thinkingHoldMs
        ) {
            return "thinking";
        }
        if (this.talkMode === "chat" && this.gaze.trackingEnabled && !this.gaze.detected) {
            return "face_lost";
        }
        if (
            this.talkMode === "sincro" &&
            this.faceMotion.trackingEnabled &&
            !this.faceMotion.detected
        ) {
            return "face_lost";
        }
        if (this.talkMode === "chat" && this.gaze.detected) {
            return "attending";
        }
        if (this.talkMode === "sincro" && this.faceMotion.detected) {
            return "attending";
        }
        return "idle";
    }

    private buildMotionPolicy(nowMs: number): CharacterMotionPolicySnapshot {
        const neutralTransition =
            nowMs - this.talkModeChangedAtMs <= BEHAVIOR_TIMING.modeNeutralTransitionMs;
        if (this.talkMode === "sincro") {
            return {
                talkMode: "sincro",
                primaryInput: "faceMotion",
                neutralTransition,
                allowGazeMotion: false,
                allowFaceRetarget: true,
                allowPoseRetarget:
                    this.poseMotion.trackingEnabled && !this.poseMotion.degradedToFaceOnly,
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

    private normalizeTalkMode(mode: string): CharacterTalkMode {
        return mode === "sincro" ? "sincro" : "chat";
    }

    private smoothEnvelope(previous: number, next: number): number {
        const alpha = next > previous ? BEHAVIOR_TIMING.vadAttack : BEHAVIOR_TIMING.vadRelease;
        return previous + (next - previous) * alpha;
    }

    private nextAiSpeechBeat(
        message: TelopChannelMessage,
        nowMs: number,
    ): { kind: CharacterBehaviorAiSpeechBeatKind; text?: string; intensity: number } | undefined {
        if (!message.new_text) {
            return undefined;
        }

        const speechChanged =
            !this.aiSpeech.isSpeaking || this.aiSpeech.speechId !== message.speech_id;
        const text =
            nonEmptyStringOrUndefined(message.text) ?? nonEmptyStringOrUndefined(message.message);
        const lengthSeconds = Math.max(0, Number(message.length) || 0);
        const isPunctuation = /[、。,.!?！？]/.test(message.text);
        const isPhrasePause = lengthSeconds >= BEHAVIOR_TIMING.aiSpeechPhrasePauseSeconds;
        const lastBeatAtMs = this.aiSpeech.lastBeatAtMs;
        const enoughCadenceGap =
            lastBeatAtMs === undefined ||
            nowMs - lastBeatAtMs >= BEHAVIOR_TIMING.aiSpeechCadenceBeatMs;

        if (speechChanged) {
            return { kind: "speech_start", text, intensity: 0.8 };
        }
        if (isPunctuation) {
            return { kind: "punctuation", text, intensity: 0.55 };
        }
        if (isPhrasePause && enoughCadenceGap) {
            return { kind: "phrase", text, intensity: 0.62 };
        }
        if (enoughCadenceGap) {
            return { kind: "cadence", text, intensity: 0.42 };
        }
        return undefined;
    }

    private expressionCodeForSpeech(speechId: number): number | undefined {
        return this.expressionCodeBySpeechId.get(speechId);
    }

    private refreshGazeStaleness(nowMs: number): void {
        if (
            !this.gaze.trackingEnabled ||
            this.gaze.lastUpdatedAtMs === undefined ||
            nowMs - this.gaze.lastUpdatedAtMs <= BEHAVIOR_TIMING.gazeStaleMs
        ) {
            return;
        }
        this.gaze = {
            ...this.gaze,
            detected: false,
            rawDetected: false,
            targetX: 0.5,
            targetY: 0.5,
            facing: 0.5,
            detectionCount: 0,
            lastUpdatedAtMs: nowMs,
        };
    }

    private currentErrorMessage(): string | undefined {
        const first = this.errorMessagesBySource.values().next();
        return first.done ? undefined : first.value;
    }
}

function clonePoseArmMotion(snapshot: SincroPoseArmMotionSnapshot): SincroPoseArmMotionSnapshot {
    return {
        ...snapshot,
        targets: {
            shoulder: { ...snapshot.targets.shoulder },
            elbow: { ...snapshot.targets.elbow },
            wrist: { ...snapshot.targets.wrist },
        },
    };
}

function nonEmptyStringOrUndefined(value: string | undefined): string | undefined {
    return value === undefined || value === "" ? undefined : value;
}
