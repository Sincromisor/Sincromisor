import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../../CharacterGaze/CharacterGaze";
import {
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
} from "../../FaceTracking/SincroFaceMotionSnapshot";
import type { SincroFaceMotionSnapshot } from "../../FaceTracking/SincroFaceMotionSnapshot";
import { ChatMessage, TelopChannelMessage } from "../../RTC/RTCMessage";
import { TalkManager, TalkManagerEvent } from "../../RTC/TalkManager";
import { VadStateReport } from "../../RTC/UserMediaManager";

export type CharacterInteractionState =
    | "idle"
    | "attending"
    | "user_speaking"
    | "thinking"
    | "ai_speaking"
    | "face_lost"
    | "error_or_disconnected";

export type CharacterBehaviorVadSnapshot = {
    isSpeech: boolean;
    rawIsSpeech: boolean;
    rms: number;
    peak: number;
    envelopeRms: number;
    envelopePeak: number;
    speechStartedAtMs: number | null;
    lastSpeechEndedAtMs: number | null;
    lastSpeechDurationMs: number;
    lastSpeechAtMs: number | null;
    lastUpdatedAtMs: number | null;
};

export type CharacterBehaviorGazeSnapshot = {
    trackingEnabled: boolean;
    detected: boolean;
    rawDetected: boolean;
    targetX: number;
    targetY: number;
    facing: number;
    detectionCount: number;
    lastDetectedAtMs: number | null;
    lastUpdatedAtMs: number | null;
};

export type CharacterBehaviorAiSpeechSnapshot = {
    isSpeaking: boolean;
    speechId: number | null;
    currentMoraId: number | null;
    expressionCode: number | null;
    currentVowel: string | null;
    currentText: string | null;
    currentLengthSeconds: number;
    beatId: number;
    beatKind: CharacterBehaviorAiSpeechBeatKind | null;
    beatText: string | null;
    beatIntensity: number;
    lastBeatAtMs: number | null;
    lastTextMessage: ChatMessage | null;
    lastTelopMessage: TelopChannelMessage | null;
    lastStartedAtMs: number | null;
    lastUpdatedAtMs: number | null;
    lastEndedAtMs: number | null;
};

export type CharacterBehaviorAiSpeechBeatKind = "speech_start" | "cadence" | "phrase" | "punctuation";

export type CharacterBehaviorSnapshot = {
    state: CharacterInteractionState;
    previousState: CharacterInteractionState;
    stateChangedAtMs: number;
    nowMs: number;
    vad: CharacterBehaviorVadSnapshot;
    gaze: CharacterBehaviorGazeSnapshot;
    faceMotion: SincroFaceMotionSnapshot;
    aiSpeech: CharacterBehaviorAiSpeechSnapshot;
    errorMessage: string | null;
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
} as const;

// キャラクター表現が参照する入力状態の集約点。
// ボーン/表情 controller が個別に TalkManager や Gaze を購読し続けるとタイミング調整が分散するため、
// 後続の姿勢・目線・発話同期モーションはこの snapshot を正本として参照する。
export class CharacterBehaviorState {
    private static instance: CharacterBehaviorState;
    private previousState: CharacterInteractionState = "idle";
    private state: CharacterInteractionState = "idle";
    private stateChangedAtMs = performance.now();
    private errorMessage: string | null = null;
    private readonly errorMessagesBySource = new Map<string, string>();
    private readonly expressionCodeBySpeechId = new Map<number, number | null>();
    private lastUserSpeechEndedAtMs: number | null = null;
    private pendingRawSpeechStartedAtMs: number | null = null;
    private vad: CharacterBehaviorVadSnapshot = {
        isSpeech: false,
        rawIsSpeech: false,
        rms: 0,
        peak: 0,
        envelopeRms: 0,
        envelopePeak: 0,
        speechStartedAtMs: null,
        lastSpeechEndedAtMs: null,
        lastSpeechDurationMs: 0,
        lastSpeechAtMs: null,
        lastUpdatedAtMs: null,
    };
    private gaze: CharacterBehaviorGazeSnapshot = {
        trackingEnabled: false,
        detected: false,
        rawDetected: false,
        targetX: 0.5,
        targetY: 0.5,
        facing: 0.5,
        detectionCount: 0,
        lastDetectedAtMs: null,
        lastUpdatedAtMs: null,
    };
    private faceMotion: SincroFaceMotionSnapshot = {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
        blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
    };
    private aiSpeech: CharacterBehaviorAiSpeechSnapshot = {
        isSpeaking: false,
        speechId: null,
        currentMoraId: null,
        expressionCode: null,
        currentVowel: null,
        currentText: null,
        currentLengthSeconds: 0,
        beatId: 0,
        beatKind: null,
        beatText: null,
        beatIntensity: 0,
        lastBeatAtMs: null,
        lastTextMessage: null,
        lastTelopMessage: null,
        lastStartedAtMs: null,
        lastUpdatedAtMs: null,
        lastEndedAtMs: null,
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
        if (report.isSpeech && this.pendingRawSpeechStartedAtMs == null) {
            this.pendingRawSpeechStartedAtMs = nowMs;
        }
        if (!report.isSpeech && !wasSpeech) {
            this.pendingRawSpeechStartedAtMs = null;
        }
        const rawSpeechAgeMs = this.pendingRawSpeechStartedAtMs == null
            ? 0
            : nowMs - this.pendingRawSpeechStartedAtMs;
        const acceptedRawSpeech = report.isSpeech && rawSpeechAgeMs >= BEHAVIOR_TIMING.vadOnsetDebounceMs;
        const lastSpeechAtMs = report.isSpeech ? nowMs : this.vad.lastSpeechAtMs;
        const isSpeech = acceptedRawSpeech || (
            wasSpeech
            && lastSpeechAtMs != null
            && nowMs - lastSpeechAtMs <= BEHAVIOR_TIMING.vadSpeechHoldMs
        );
        const speechStartedAtMs = isSpeech
            ? this.vad.speechStartedAtMs ?? this.pendingRawSpeechStartedAtMs ?? nowMs
            : null;
        const speechDurationMs = wasSpeech
            ? nowMs - (this.vad.speechStartedAtMs ?? nowMs)
            : 0;
        const completedMeaningfulSpeech = speechDurationMs >= BEHAVIOR_TIMING.vadMinimumMeaningfulSpeechMs;
        const lastSpeechEndedAtMs = wasSpeech && !isSpeech && completedMeaningfulSpeech
            ? nowMs
            : this.vad.lastSpeechEndedAtMs;
        const lastSpeechDurationMs = wasSpeech && !isSpeech
            ? speechDurationMs
            : this.vad.lastSpeechDurationMs;

        if (wasSpeech && !isSpeech && completedMeaningfulSpeech) {
            this.lastUserSpeechEndedAtMs = nowMs;
        }
        if (wasSpeech && !isSpeech) {
            this.pendingRawSpeechStartedAtMs = report.isSpeech ? nowMs : null;
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

    applyGazeState(characterGaze: CharacterGaze, detections: Detection[], nowMs: number = performance.now()): void {
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

    setError(message: string | null, nowMs: number = performance.now()): void {
        this.setErrorSource("general", message, nowMs);
    }

    setErrorSource(source: string, message: string | null, nowMs: number = performance.now()): void {
        if (message) {
            this.errorMessagesBySource.set(source, message);
        } else {
            this.errorMessagesBySource.delete(source);
        }
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
        return {
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
        const expressionCode = typeof message.expression_code === "number" ? message.expression_code : null;
        this.expressionCodeBySpeechId.set(message.speech_id, expressionCode);
        const shouldApplyToCurrentSpeech = this.aiSpeech.speechId == null
            || this.aiSpeech.speechId === message.speech_id
            || !this.aiSpeech.isSpeaking;
        this.aiSpeech = {
            ...this.aiSpeech,
            speechId: shouldApplyToCurrentSpeech ? message.speech_id : this.aiSpeech.speechId,
            expressionCode: shouldApplyToCurrentSpeech ? expressionCode : this.aiSpeech.expressionCode,
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
            currentMoraId: message.new_text ? (this.aiSpeech.currentMoraId ?? -1) + 1 : this.aiSpeech.currentMoraId,
            expressionCode: speechChanged
                ? this.expressionCodeForSpeech(message.speech_id)
                : this.aiSpeech.expressionCode,
            currentVowel: message.vowel || null,
            currentText: message.text || null,
            currentLengthSeconds: Math.max(0, Number(message.length) || 0),
            beatId: beat ? this.aiSpeech.beatId + 1 : this.aiSpeech.beatId,
            beatKind: beat?.kind ?? (speechChanged ? null : this.aiSpeech.beatKind),
            beatText: beat?.text ?? (speechChanged ? null : this.aiSpeech.beatText),
            beatIntensity: beat?.intensity ?? (speechChanged ? 0 : this.aiSpeech.beatIntensity),
            lastBeatAtMs: beat ? nowMs : this.aiSpeech.lastBeatAtMs,
            lastTelopMessage: message,
            lastStartedAtMs: wasSpeaking ? this.aiSpeech.lastStartedAtMs : nowMs,
            lastUpdatedAtMs: nowMs,
            lastEndedAtMs: null,
        };
    }

    private refreshAiSpeechFromCurrentMora(nowMs: number): void {
        const currentMora = TalkManager.getManager().currentMora();
        const lastUpdatedAtMs = this.aiSpeech.lastUpdatedAtMs;
        const heldByRecentTelop = lastUpdatedAtMs != null
            && nowMs - lastUpdatedAtMs <= BEHAVIOR_TIMING.aiSpeechHoldMs;
        const isSpeaking = currentMora != null || heldByRecentTelop;
        if (isSpeaking) {
            const currentSpeechId = currentMora?.mora.speech_id ?? this.aiSpeech.speechId;
            this.aiSpeech = {
                ...this.aiSpeech,
                isSpeaking: true,
                speechId: currentSpeechId,
                currentMoraId: currentMora?.moraID ?? this.aiSpeech.currentMoraId,
                expressionCode: currentSpeechId == null
                    ? this.aiSpeech.expressionCode
                    : this.expressionCodeForSpeech(currentSpeechId),
                currentVowel: currentMora?.mora.vowel || this.aiSpeech.currentVowel,
                currentText: currentMora?.mora.text || this.aiSpeech.currentText,
                currentLengthSeconds: currentMora
                    ? Math.max(0, Number(currentMora.mora.length) || 0)
                    : this.aiSpeech.currentLengthSeconds,
                lastUpdatedAtMs: currentMora ? nowMs : this.aiSpeech.lastUpdatedAtMs,
                lastEndedAtMs: null,
            };
            return;
        }
        if (this.aiSpeech.isSpeaking) {
            this.aiSpeech = {
                ...this.aiSpeech,
                isSpeaking: false,
                currentVowel: null,
                currentText: null,
                currentLengthSeconds: 0,
                currentMoraId: null,
                beatKind: null,
                beatText: null,
                beatIntensity: 0,
                lastEndedAtMs: nowMs,
            };
        }
    }

    private deriveState(nowMs: number): CharacterInteractionState {
        if (this.errorMessage) {
            return "error_or_disconnected";
        }
        if (this.aiSpeech.isSpeaking) {
            return "ai_speaking";
        }
        if (this.vad.isSpeech) {
            return "user_speaking";
        }
        if (
            this.lastUserSpeechEndedAtMs != null
            && nowMs - this.lastUserSpeechEndedAtMs <= BEHAVIOR_TIMING.thinkingHoldMs
        ) {
            return "thinking";
        }
        if (this.gaze.trackingEnabled && !this.gaze.detected) {
            return "face_lost";
        }
        if (this.faceMotion.trackingEnabled && !this.faceMotion.detected) {
            return "face_lost";
        }
        if (this.gaze.detected) {
            return "attending";
        }
        if (this.faceMotion.detected) {
            return "attending";
        }
        return "idle";
    }

    private smoothEnvelope(previous: number, next: number): number {
        const alpha = next > previous ? BEHAVIOR_TIMING.vadAttack : BEHAVIOR_TIMING.vadRelease;
        return previous + (next - previous) * alpha;
    }

    private nextAiSpeechBeat(
        message: TelopChannelMessage,
        nowMs: number,
    ): { kind: CharacterBehaviorAiSpeechBeatKind; text: string | null; intensity: number } | null {
        if (!message.new_text) {
            return null;
        }

        const speechChanged = !this.aiSpeech.isSpeaking || this.aiSpeech.speechId !== message.speech_id;
        const text = message.text || message.message || null;
        const lengthSeconds = Math.max(0, Number(message.length) || 0);
        const isPunctuation = /[、。,.!?！？]/.test(message.text || "");
        const isPhrasePause = lengthSeconds >= BEHAVIOR_TIMING.aiSpeechPhrasePauseSeconds;
        const lastBeatAtMs = this.aiSpeech.lastBeatAtMs;
        const enoughCadenceGap = lastBeatAtMs == null
            || nowMs - lastBeatAtMs >= BEHAVIOR_TIMING.aiSpeechCadenceBeatMs;

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
        return null;
    }

    private expressionCodeForSpeech(speechId: number): number | null {
        return this.expressionCodeBySpeechId.has(speechId)
            ? this.expressionCodeBySpeechId.get(speechId) ?? null
            : null;
    }

    private refreshGazeStaleness(nowMs: number): void {
        if (
            !this.gaze.trackingEnabled
            || this.gaze.lastUpdatedAtMs == null
            || nowMs - this.gaze.lastUpdatedAtMs <= BEHAVIOR_TIMING.gazeStaleMs
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

    private currentErrorMessage(): string | null {
        const first = this.errorMessagesBySource.values().next();
        return first.done ? null : first.value;
    }
}
