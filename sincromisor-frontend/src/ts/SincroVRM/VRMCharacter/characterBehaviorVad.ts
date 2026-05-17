import type { VadStateReport } from "../../RTC/UserMediaManager";
import { BEHAVIOR_TIMING, type CharacterBehaviorVadSnapshot } from "./characterBehaviorTypes";
import { nonNegativeNumberOrZero } from "./characterBehaviorValues";

type ApplyCharacterBehaviorVadReportOptions = {
    report: VadStateReport;
    currentVad: CharacterBehaviorVadSnapshot;
    pendingRawSpeechStartedAtMs?: number;
    lastUserSpeechEndedAtMs?: number;
    nowMs: number;
};

type CharacterBehaviorVadUpdate = {
    vad: CharacterBehaviorVadSnapshot;
    pendingRawSpeechStartedAtMs?: number;
    lastUserSpeechEndedAtMs?: number;
};

export function applyCharacterBehaviorVadReport(
    options: ApplyCharacterBehaviorVadReportOptions,
): CharacterBehaviorVadUpdate {
    const rms = nonNegativeNumberOrZero(options.report.rms);
    const peak = nonNegativeNumberOrZero(options.report.peak);
    const wasSpeech = options.currentVad.isSpeech;
    const envelopeRms = smoothEnvelope(options.currentVad.envelopeRms, rms);
    const envelopePeak = smoothEnvelope(options.currentVad.envelopePeak, peak);
    let pendingRawSpeechStartedAtMs = options.pendingRawSpeechStartedAtMs;
    if (options.report.isSpeech && pendingRawSpeechStartedAtMs === undefined) {
        pendingRawSpeechStartedAtMs = options.nowMs;
    }
    if (!options.report.isSpeech && !wasSpeech) {
        pendingRawSpeechStartedAtMs = undefined;
    }

    const rawSpeechAgeMs =
        pendingRawSpeechStartedAtMs === undefined ? 0 : options.nowMs - pendingRawSpeechStartedAtMs;
    const acceptedRawSpeech =
        options.report.isSpeech && rawSpeechAgeMs >= BEHAVIOR_TIMING.vadOnsetDebounceMs;
    const lastSpeechAtMs = options.report.isSpeech
        ? options.nowMs
        : options.currentVad.lastSpeechAtMs;
    const isSpeech =
        acceptedRawSpeech ||
        (wasSpeech &&
            lastSpeechAtMs !== undefined &&
            options.nowMs - lastSpeechAtMs <= BEHAVIOR_TIMING.vadSpeechHoldMs);
    const speechStartedAtMs = isSpeech
        ? (options.currentVad.speechStartedAtMs ?? pendingRawSpeechStartedAtMs ?? options.nowMs)
        : undefined;
    const speechDurationMs = wasSpeech
        ? options.nowMs - (options.currentVad.speechStartedAtMs ?? options.nowMs)
        : 0;
    const completedMeaningfulSpeech =
        speechDurationMs >= BEHAVIOR_TIMING.vadMinimumMeaningfulSpeechMs;
    const lastSpeechEndedAtMs =
        wasSpeech && !isSpeech && completedMeaningfulSpeech
            ? options.nowMs
            : options.currentVad.lastSpeechEndedAtMs;
    const lastSpeechDurationMs =
        wasSpeech && !isSpeech ? speechDurationMs : options.currentVad.lastSpeechDurationMs;
    const lastUserSpeechEndedAtMs =
        wasSpeech && !isSpeech && completedMeaningfulSpeech
            ? options.nowMs
            : options.lastUserSpeechEndedAtMs;

    if (wasSpeech && !isSpeech) {
        pendingRawSpeechStartedAtMs = options.report.isSpeech ? options.nowMs : undefined;
    }

    return {
        vad: {
            isSpeech,
            rawIsSpeech: options.report.isSpeech,
            rms,
            peak,
            envelopeRms,
            envelopePeak,
            speechStartedAtMs,
            lastSpeechEndedAtMs,
            lastSpeechDurationMs,
            lastSpeechAtMs,
            lastUpdatedAtMs: options.nowMs,
        },
        pendingRawSpeechStartedAtMs,
        lastUserSpeechEndedAtMs,
    };
}

function smoothEnvelope(previous: number, next: number): number {
    const alpha = next > previous ? BEHAVIOR_TIMING.vadAttack : BEHAVIOR_TIMING.vadRelease;
    return previous + (next - previous) * alpha;
}
