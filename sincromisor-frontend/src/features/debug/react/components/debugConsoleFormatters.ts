import {
    DEBUG_CONSOLE_TREND_MAX_VALUES,
    type DebugConsoleSnapshot,
    type DebugConsoleTrendKey,
} from "../../model/debugConsoleManager";

export function meterPercent(value: number): string {
    return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function metricPercent(value: number): string {
    return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

export function vadProbabilityLabel(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return "-";
    }
    return `${(Math.max(0, Math.min(1, value)) * 100).toFixed(1)}%`;
}

export function learnedVadFramesLabel(snapshot: DebugConsoleSnapshot): string {
    const tx = Number.isFinite(snapshot.audio.learnedVadReport.txFrames)
        ? Math.max(0, Math.floor(snapshot.audio.learnedVadReport.txFrames ?? 0))
        : 0;
    const rx = Number.isFinite(snapshot.audio.learnedVadReport.rxPredictions)
        ? Math.max(0, Math.floor(snapshot.audio.learnedVadReport.rxPredictions ?? 0))
        : 0;
    return `tx:${tx} rx:${rx}`;
}

export function localVadEngineLabel(snapshot: DebugConsoleSnapshot): string {
    if (snapshot.audio.vadThresholdMode === "learned") {
        return "Silero";
    }
    if (snapshot.audio.vadThresholdMode === "auto") {
        return "Auto RMS";
    }
    return "RMS";
}

export function stateClassName(value: string): string {
    const normalized = value.toLowerCase();
    if (normalized.includes("connected") || normalized.includes("completed")) {
        return "state-ok";
    }
    if (normalized.includes("checking") || normalized.includes("disconnected")) {
        return "state-warn";
    }
    if (normalized.includes("failed") || normalized.includes("closed")) {
        return "state-error";
    }
    return "";
}

function buildTrendPoints(series: number[], maxValue: number): string {
    if (series.length === 0) {
        return "";
    }
    const width = 300;
    const height = 86;
    const xStep = series.length > 1 ? width / (series.length - 1) : 0;
    return series
        .map((value, index) => {
            const clamped = Math.max(0, Math.min(maxValue, value));
            const x = series.length === 1 ? width / 2 : index * xStep;
            const y = height - (clamped / maxValue) * height;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
}

export function renderTrendGraph(
    snapshot: DebugConsoleSnapshot,
    key: DebugConsoleTrendKey,
): string {
    return buildTrendPoints(snapshot.rtc.trends[key], DEBUG_CONSOLE_TREND_MAX_VALUES[key]);
}
