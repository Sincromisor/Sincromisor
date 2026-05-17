import type { ChatMessage, TelopChannelMessage } from "../../RTC/RTCMessage";
import type { CurrentMora } from "../../RTC/TalkManager";
import {
    BEHAVIOR_TIMING,
    type CharacterBehaviorAiSpeechBeatKind,
    type CharacterBehaviorAiSpeechSnapshot,
} from "./characterBehaviorTypes";
import { nonEmptyStringOrUndefined, nonNegativeNumberOrZero } from "./characterBehaviorValues";

type AiSpeechBeat = {
    kind: CharacterBehaviorAiSpeechBeatKind;
    text?: string;
    intensity: number;
};

type ApplyTextChannelMessageOptions = {
    message: ChatMessage;
    currentAiSpeech: CharacterBehaviorAiSpeechSnapshot;
    expressionCodeBySpeechId: Map<number, number>;
    nowMs: number;
};

type ApplyTelopChannelMessageOptions = {
    message: TelopChannelMessage;
    currentAiSpeech: CharacterBehaviorAiSpeechSnapshot;
    expressionCodeBySpeechId: Map<number, number>;
    nowMs: number;
};

type RefreshAiSpeechFromCurrentMoraOptions = {
    currentMora: CurrentMora | undefined;
    currentAiSpeech: CharacterBehaviorAiSpeechSnapshot;
    expressionCodeBySpeechId: Map<number, number>;
    nowMs: number;
};

export function applyTextChannelMessageToAiSpeech(
    options: ApplyTextChannelMessageOptions,
): CharacterBehaviorAiSpeechSnapshot {
    if (options.message.message_type !== "system") {
        return options.currentAiSpeech;
    }
    const expressionCode =
        typeof options.message.expression_code === "number"
            ? options.message.expression_code
            : undefined;
    if (expressionCode === undefined) {
        options.expressionCodeBySpeechId.delete(options.message.speech_id);
    } else {
        options.expressionCodeBySpeechId.set(options.message.speech_id, expressionCode);
    }
    const shouldApplyToCurrentSpeech =
        options.currentAiSpeech.speechId === undefined ||
        options.currentAiSpeech.speechId === options.message.speech_id ||
        !options.currentAiSpeech.isSpeaking;
    return {
        ...options.currentAiSpeech,
        speechId: shouldApplyToCurrentSpeech
            ? options.message.speech_id
            : options.currentAiSpeech.speechId,
        expressionCode: shouldApplyToCurrentSpeech
            ? expressionCode
            : options.currentAiSpeech.expressionCode,
        lastTextMessage: options.message,
        lastUpdatedAtMs: options.nowMs,
    };
}

export function applyTelopChannelMessageToAiSpeech(
    options: ApplyTelopChannelMessageOptions,
): CharacterBehaviorAiSpeechSnapshot {
    const speechChanged = options.currentAiSpeech.speechId !== options.message.speech_id;
    const wasSpeaking = options.currentAiSpeech.isSpeaking && !speechChanged;
    const beat = nextAiSpeechBeat({
        message: options.message,
        currentAiSpeech: options.currentAiSpeech,
        nowMs: options.nowMs,
    });
    return {
        ...options.currentAiSpeech,
        isSpeaking: true,
        speechId: options.message.speech_id,
        currentMoraId: options.message.new_text
            ? (options.currentAiSpeech.currentMoraId ?? -1) + 1
            : options.currentAiSpeech.currentMoraId,
        expressionCode: speechChanged
            ? expressionCodeForSpeech(options.expressionCodeBySpeechId, options.message.speech_id)
            : options.currentAiSpeech.expressionCode,
        currentVowel: nonEmptyStringOrUndefined(options.message.vowel),
        currentText: nonEmptyStringOrUndefined(options.message.text),
        currentLengthSeconds: nonNegativeNumberOrZero(options.message.length),
        beatId: beat ? options.currentAiSpeech.beatId + 1 : options.currentAiSpeech.beatId,
        beatKind: beat?.kind ?? (speechChanged ? undefined : options.currentAiSpeech.beatKind),
        beatText: beat?.text ?? (speechChanged ? undefined : options.currentAiSpeech.beatText),
        beatIntensity:
            beat?.intensity ?? (speechChanged ? 0 : options.currentAiSpeech.beatIntensity),
        lastBeatAtMs: beat ? options.nowMs : options.currentAiSpeech.lastBeatAtMs,
        lastTelopMessage: options.message,
        lastStartedAtMs: wasSpeaking ? options.currentAiSpeech.lastStartedAtMs : options.nowMs,
        lastUpdatedAtMs: options.nowMs,
        lastEndedAtMs: undefined,
    };
}

export function refreshAiSpeechFromCurrentMora(
    options: RefreshAiSpeechFromCurrentMoraOptions,
): CharacterBehaviorAiSpeechSnapshot {
    const lastUpdatedAtMs = options.currentAiSpeech.lastUpdatedAtMs;
    const heldByRecentTelop =
        lastUpdatedAtMs !== undefined &&
        options.nowMs - lastUpdatedAtMs <= BEHAVIOR_TIMING.aiSpeechHoldMs;
    const isSpeaking = options.currentMora !== undefined || heldByRecentTelop;
    if (isSpeaking) {
        const currentSpeechId =
            options.currentMora?.mora.speech_id ?? options.currentAiSpeech.speechId;
        return {
            ...options.currentAiSpeech,
            isSpeaking: true,
            speechId: currentSpeechId,
            currentMoraId: options.currentMora?.moraID ?? options.currentAiSpeech.currentMoraId,
            expressionCode:
                currentSpeechId === undefined
                    ? options.currentAiSpeech.expressionCode
                    : expressionCodeForSpeech(options.expressionCodeBySpeechId, currentSpeechId),
            currentVowel:
                nonEmptyStringOrUndefined(options.currentMora?.mora.vowel) ??
                options.currentAiSpeech.currentVowel,
            currentText:
                nonEmptyStringOrUndefined(options.currentMora?.mora.text) ??
                options.currentAiSpeech.currentText,
            currentLengthSeconds: options.currentMora
                ? nonNegativeNumberOrZero(options.currentMora.mora.length)
                : options.currentAiSpeech.currentLengthSeconds,
            lastUpdatedAtMs: options.currentMora
                ? options.nowMs
                : options.currentAiSpeech.lastUpdatedAtMs,
            lastEndedAtMs: undefined,
        };
    }
    if (!options.currentAiSpeech.isSpeaking) {
        return options.currentAiSpeech;
    }
    return {
        ...options.currentAiSpeech,
        isSpeaking: false,
        currentVowel: undefined,
        currentText: undefined,
        currentLengthSeconds: 0,
        currentMoraId: undefined,
        beatKind: undefined,
        beatText: undefined,
        beatIntensity: 0,
        lastEndedAtMs: options.nowMs,
    };
}

function nextAiSpeechBeat(options: {
    message: TelopChannelMessage;
    currentAiSpeech: CharacterBehaviorAiSpeechSnapshot;
    nowMs: number;
}): AiSpeechBeat | undefined {
    if (!options.message.new_text) {
        return undefined;
    }

    const speechChanged =
        !options.currentAiSpeech.isSpeaking ||
        options.currentAiSpeech.speechId !== options.message.speech_id;
    const text =
        nonEmptyStringOrUndefined(options.message.text) ??
        nonEmptyStringOrUndefined(options.message.message);
    const lengthSeconds = nonNegativeNumberOrZero(options.message.length);
    const isPunctuation = /[、。,.!?！？]/.test(options.message.text);
    const isPhrasePause = lengthSeconds >= BEHAVIOR_TIMING.aiSpeechPhrasePauseSeconds;
    const lastBeatAtMs = options.currentAiSpeech.lastBeatAtMs;
    const enoughCadenceGap =
        lastBeatAtMs === undefined ||
        options.nowMs - lastBeatAtMs >= BEHAVIOR_TIMING.aiSpeechCadenceBeatMs;

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

function expressionCodeForSpeech(
    expressionCodeBySpeechId: Map<number, number>,
    speechId: number,
): number | undefined {
    return expressionCodeBySpeechId.get(speechId);
}
