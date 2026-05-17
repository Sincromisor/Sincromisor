import type {
    AudioFilterControlConfig,
    LearnedVadPerformanceMode,
    LearnedVadTuningUiConfig,
    LearnedVadUiReport,
    VadThresholdMode,
} from "./debugConsolePublicTypes";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

export type RuntimeAudioConstraintKey = "autoGainControl" | "noiseSuppression" | "echoCancellation";

export type RuntimeAudioConstraintApplyStatus = {
    key: RuntimeAudioConstraintKey;
    enabled: boolean;
    status: "pending" | "applied" | "failed";
    message?: string;
};

type ConstraintStatusTone = "" | "state-ok" | "state-warn" | "state-error";
type RuntimeAudioConstraintApplyState = Partial<
    Record<RuntimeAudioConstraintKey, RuntimeAudioConstraintApplyStatus>
>;

const AUDIO_CONSTRAINT_STATUS_ORDER: RuntimeAudioConstraintKey[] = [
    "noiseSuppression",
    "echoCancellation",
    "autoGainControl",
];

const AUDIO_CONSTRAINT_STATUS_LABELS: Record<RuntimeAudioConstraintKey, string> = {
    noiseSuppression: "NS",
    echoCancellation: "EC",
    autoGainControl: "AGC",
};

export function updateAudioVadThresholdMode(
    snapshot: DebugConsoleSnapshot,
    mode: VadThresholdMode,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, { vadThresholdMode: mode });
}

export function updateAudioLearnedVadTuning(
    snapshot: DebugConsoleSnapshot,
    config: LearnedVadTuningUiConfig,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, {
        learnedVadTuning: {
            ...config,
            onConsecutiveFrames: Math.max(1, Math.round(config.onConsecutiveFrames)),
            offConsecutiveFrames: Math.max(1, Math.round(config.offConsecutiveFrames)),
        },
    });
}

export function updateAudioLearnedVadPerformanceMode(
    snapshot: DebugConsoleSnapshot,
    mode: LearnedVadPerformanceMode,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, { learnedVadPerformanceMode: mode });
}

export function updateAudioLearnedVadStrictMode(
    snapshot: DebugConsoleSnapshot,
    enabled: boolean,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, { learnedVadStrictMode: enabled });
}

export function updateAudioFilterConfig(
    snapshot: DebugConsoleSnapshot,
    config: AudioFilterControlConfig,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, {
        filterConfig: {
            highpassHz: Math.max(60, Math.min(300, Math.round(config.highpassHz))),
            lowpassEnabled: !!config.lowpassEnabled,
            lowpassHz: Math.max(2500, Math.min(10000, Math.round(config.lowpassHz))),
        },
    });
}

export function updateAudioVadRmsThreshold(
    snapshot: DebugConsoleSnapshot,
    value: number,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, {
        vadRmsThreshold: Math.max(0.005, Math.min(0.2, value)),
    });
}

export function updateAudioVadState(
    snapshot: DebugConsoleSnapshot,
    isSpeech: boolean,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, { localVadIsSpeech: isSpeech });
}

export function updateAudioLearnedVadReport(
    snapshot: DebugConsoleSnapshot,
    report: LearnedVadUiReport,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, { learnedVadReport: { ...report } });
}

export function updateAudioConstraintStatus(
    snapshot: DebugConsoleSnapshot,
    state: RuntimeAudioConstraintApplyState,
): DebugConsoleSnapshot {
    return updateAudioSnapshot(snapshot, {
        constraintStatus: buildAudioConstraintStatus(state),
    });
}

function updateAudioSnapshot(
    snapshot: DebugConsoleSnapshot,
    audioPatch: Partial<DebugConsoleSnapshot["audio"]>,
): DebugConsoleSnapshot {
    return {
        ...snapshot,
        audio: {
            ...snapshot.audio,
            ...audioPatch,
        },
    };
}

function buildAudioConstraintStatus(
    state: RuntimeAudioConstraintApplyState,
): DebugConsoleSnapshot["audio"]["constraintStatus"] {
    return {
        text: buildAudioConstraintStatusText(state),
        title: buildAudioConstraintStatusTitle(state),
        tone: pickAudioConstraintStatusTone(state),
    };
}

function buildAudioConstraintStatusText(state: RuntimeAudioConstraintApplyState): string {
    return AUDIO_CONSTRAINT_STATUS_ORDER.map((key) => {
        const status = state[key];
        if (!status) {
            return `${AUDIO_CONSTRAINT_STATUS_LABELS[key]}:未確認`;
        }
        if (status.status === "pending") {
            return `${AUDIO_CONSTRAINT_STATUS_LABELS[key]}:${status.enabled ? "ON" : "OFF"}(次回開始時)`;
        }
        if (status.status === "applied") {
            return `${AUDIO_CONSTRAINT_STATUS_LABELS[key]}:${status.enabled ? "ON" : "OFF"}(反映)`;
        }
        return `${AUDIO_CONSTRAINT_STATUS_LABELS[key]}:${status.enabled ? "ON" : "OFF"}(未反映)`;
    }).join(" / ");
}

function buildAudioConstraintStatusTitle(state: RuntimeAudioConstraintApplyState): string {
    return AUDIO_CONSTRAINT_STATUS_ORDER.map((key) => {
        const status = state[key];
        if (!status?.message) {
            return "";
        }
        return `${AUDIO_CONSTRAINT_STATUS_LABELS[key]}: ${status.message}`;
    })
        .filter((line) => line.length > 0)
        .join("\n");
}

function pickAudioConstraintStatusTone(
    state: RuntimeAudioConstraintApplyState,
): ConstraintStatusTone {
    const hasFailed = AUDIO_CONSTRAINT_STATUS_ORDER.some((key) => state[key]?.status === "failed");
    if (hasFailed) {
        return "state-error";
    }
    const hasPending = AUDIO_CONSTRAINT_STATUS_ORDER.some(
        (key) => state[key]?.status === "pending",
    );
    return hasPending ? "state-warn" : "state-ok";
}
