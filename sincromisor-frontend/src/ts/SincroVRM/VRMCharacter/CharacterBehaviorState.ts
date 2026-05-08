import { Detection } from "@mediapipe/tasks-vision";
import { CharacterGaze } from "../../CharacterGaze/CharacterGaze";
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
    expressionCode: number | null;
    currentVowel: string | null;
    currentText: string | null;
    lastTextMessage: ChatMessage | null;
    lastTelopMessage: TelopChannelMessage | null;
    lastStartedAtMs: number | null;
    lastUpdatedAtMs: number | null;
    lastEndedAtMs: number | null;
};

export type CharacterBehaviorSnapshot = {
    state: CharacterInteractionState;
    previousState: CharacterInteractionState;
    stateChangedAtMs: number;
    nowMs: number;
    vad: CharacterBehaviorVadSnapshot;
    gaze: CharacterBehaviorGazeSnapshot;
    aiSpeech: CharacterBehaviorAiSpeechSnapshot;
    errorMessage: string | null;
};

const BEHAVIOR_TIMING = {
    vadAttack: 0.45,
    vadRelease: 0.12,
    vadSpeechHoldMs: 420,
    aiSpeechHoldMs: 360,
    thinkingHoldMs: 1600,
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
    private lastUserSpeechEndedAtMs: number | null = null;
    private vad: CharacterBehaviorVadSnapshot = {
        isSpeech: false,
        rawIsSpeech: false,
        rms: 0,
        peak: 0,
        envelopeRms: 0,
        envelopePeak: 0,
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
    private aiSpeech: CharacterBehaviorAiSpeechSnapshot = {
        isSpeaking: false,
        speechId: null,
        expressionCode: null,
        currentVowel: null,
        currentText: null,
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
        const lastSpeechAtMs = report.isSpeech ? nowMs : this.vad.lastSpeechAtMs;
        const isSpeech = report.isSpeech || (
            lastSpeechAtMs != null
            && nowMs - lastSpeechAtMs <= BEHAVIOR_TIMING.vadSpeechHoldMs
        );

        if (wasSpeech && !isSpeech) {
            this.lastUserSpeechEndedAtMs = nowMs;
        }

        this.vad = {
            isSpeech,
            rawIsSpeech: report.isSpeech,
            rms,
            peak,
            envelopeRms,
            envelopePeak,
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

    setError(message: string | null, nowMs: number = performance.now()): void {
        this.errorMessage = message;
        this.update(nowMs);
    }

    update(nowMs: number = performance.now()): CharacterBehaviorSnapshot {
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
        this.aiSpeech = {
            ...this.aiSpeech,
            speechId: message.speech_id,
            expressionCode: typeof message.expression_code === "number" ? message.expression_code : null,
            lastTextMessage: message,
            lastUpdatedAtMs: nowMs,
        };
    }

    private applyTelopChannelMessage(message: TelopChannelMessage, nowMs: number): void {
        const wasSpeaking = this.aiSpeech.isSpeaking;
        this.aiSpeech = {
            ...this.aiSpeech,
            isSpeaking: true,
            speechId: message.speech_id,
            currentVowel: message.vowel || null,
            currentText: message.text || null,
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
            this.aiSpeech = {
                ...this.aiSpeech,
                isSpeaking: true,
                speechId: currentMora?.mora.speech_id ?? this.aiSpeech.speechId,
                currentVowel: currentMora?.mora.vowel || this.aiSpeech.currentVowel,
                currentText: currentMora?.mora.text || this.aiSpeech.currentText,
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
        if (this.gaze.detected) {
            return "attending";
        }
        return "idle";
    }

    private smoothEnvelope(previous: number, next: number): number {
        const alpha = next > previous ? BEHAVIOR_TIMING.vadAttack : BEHAVIOR_TIMING.vadRelease;
        return previous + (next - previous) * alpha;
    }
}
