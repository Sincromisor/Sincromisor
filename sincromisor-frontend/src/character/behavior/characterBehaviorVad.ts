import type { VadStateReport } from "../../features/media/userMedia/userMediaManager";
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
    const envelopeRms = smoothEnvelope(options.currentVad.envelopeRms, rms);
    const envelopePeak = smoothEnvelope(options.currentVad.envelopePeak, peak);
    const speech = deriveVadSpeechTiming(options);

    return {
        vad: {
            isSpeech: speech.isSpeech,
            rawIsSpeech: options.report.isSpeech,
            rms,
            peak,
            envelopeRms,
            envelopePeak,
            speechStartedAtMs: speech.speechStartedAtMs,
            lastSpeechEndedAtMs: speech.lastSpeechEndedAtMs,
            lastSpeechDurationMs: speech.lastSpeechDurationMs,
            lastSpeechAtMs: speech.lastSpeechAtMs,
            lastUpdatedAtMs: options.nowMs,
        },
        pendingRawSpeechStartedAtMs: speech.pendingRawSpeechStartedAtMs,
        lastUserSpeechEndedAtMs: speech.lastUserSpeechEndedAtMs,
    };
}

function deriveVadSpeechTiming(options: ApplyCharacterBehaviorVadReportOptions): {
    isSpeech: boolean;
    pendingRawSpeechStartedAtMs?: number;
    speechStartedAtMs?: number;
    lastSpeechEndedAtMs?: number;
    lastSpeechDurationMs: number;
    lastSpeechAtMs?: number;
    lastUserSpeechEndedAtMs?: number;
} {
    const wasSpeech = options.currentVad.isSpeech;
    let pendingRawSpeechStartedAtMs = updatePendingRawSpeechStart(options, wasSpeech);
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
    const speechDurationMs = wasSpeech
        ? options.nowMs - (options.currentVad.speechStartedAtMs ?? options.nowMs)
        : 0;
    const completedMeaningfulSpeech =
        speechDurationMs >= BEHAVIOR_TIMING.vadMinimumMeaningfulSpeechMs;

    if (wasSpeech && !isSpeech) {
        pendingRawSpeechStartedAtMs = options.report.isSpeech ? options.nowMs : undefined;
    }

    return {
        isSpeech,
        pendingRawSpeechStartedAtMs,
        speechStartedAtMs: isSpeech
            ? (options.currentVad.speechStartedAtMs ?? pendingRawSpeechStartedAtMs ?? options.nowMs)
            : undefined,
        lastSpeechEndedAtMs:
            wasSpeech && !isSpeech && completedMeaningfulSpeech
                ? options.nowMs
                : options.currentVad.lastSpeechEndedAtMs,
        lastSpeechDurationMs:
            wasSpeech && !isSpeech ? speechDurationMs : options.currentVad.lastSpeechDurationMs,
        lastSpeechAtMs,
        lastUserSpeechEndedAtMs:
            wasSpeech && !isSpeech && completedMeaningfulSpeech
                ? options.nowMs
                : options.lastUserSpeechEndedAtMs,
    };
}

function updatePendingRawSpeechStart(
    options: ApplyCharacterBehaviorVadReportOptions,
    wasSpeech: boolean,
): number | undefined {
    if (options.report.isSpeech && options.pendingRawSpeechStartedAtMs === undefined) {
        return options.nowMs;
    }
    if (!options.report.isSpeech && !wasSpeech) {
        return undefined;
    }
    return options.pendingRawSpeechStartedAtMs;
}

function smoothEnvelope(previous: number, next: number): number {
    const alpha = next > previous ? BEHAVIOR_TIMING.vadAttack : BEHAVIOR_TIMING.vadRelease;
    return previous + (next - previous) * alpha;
}
