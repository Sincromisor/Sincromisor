import {
    DEBUG_CONSOLE_TREND_MAX_VALUES,
    type DebugConsoleMetricKey,
    type DebugConsoleTrendKey,
} from "./debugConsolePublicTypes";
import { DEFAULT_RTC_METRICS, type DebugConsoleSnapshot } from "./debugConsoleSnapshot";

const RTC_EVENT_LOG_LINES = 80;
const RTC_CHANNEL_LOG_LINES = 30;
const RTC_TREND_POINTS = 60;

export type RtcStateKey = "iceConnectionState" | "iceGatheringState" | "signalingState";
export type RtcSdpKey = "offerSdp" | "answerSdp";

export function resetRtcRealtimeStats(snapshot: DebugConsoleSnapshot): DebugConsoleSnapshot {
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            metrics: { ...DEFAULT_RTC_METRICS },
            trends: {
                trendOutboundAudioBitrate: [],
                trendInboundAudioBitrate: [],
                trendRoundTripTime: [],
                trendInboundPacketLossRate: [],
            },
        },
    };
}

export function isDebugConsoleMetricKey(key: string): key is DebugConsoleMetricKey {
    return key in DEFAULT_RTC_METRICS;
}

export function updateRtcMetric(
    snapshot: DebugConsoleSnapshot,
    key: DebugConsoleMetricKey,
    value: string,
): DebugConsoleSnapshot {
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            metrics: {
                ...snapshot.rtc.metrics,
                [key]: value,
            },
        },
    };
}

export function isDebugConsoleTrendKey(key: string): key is DebugConsoleTrendKey {
    return key in DEBUG_CONSOLE_TREND_MAX_VALUES;
}

export function pushRtcTrendPoint(
    snapshot: DebugConsoleSnapshot,
    key: DebugConsoleTrendKey,
    value: number | undefined,
): DebugConsoleSnapshot {
    const nextSeries = [...snapshot.rtc.trends[key]];
    nextSeries.push(value !== undefined && Number.isFinite(value) ? value : 0);
    if (nextSeries.length > RTC_TREND_POINTS) {
        nextSeries.splice(0, nextSeries.length - RTC_TREND_POINTS);
    }
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            trends: {
                ...snapshot.rtc.trends,
                [key]: nextSeries,
            },
        },
    };
}

export function appendRtcEventLog(
    snapshot: DebugConsoleSnapshot,
    message: string,
): DebugConsoleSnapshot {
    const timestamp = new Date().toLocaleTimeString("ja-JP", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
    const logLine = `[${timestamp}] ${message}\n`;
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            rtcEventLog: appendLimitedLog(snapshot.rtc.rtcEventLog, logLine, RTC_EVENT_LOG_LINES),
        },
    };
}

export function appendRtcTextChannelLog(
    snapshot: DebugConsoleSnapshot,
    message: string,
): DebugConsoleSnapshot {
    return appendRtcChannelLog(snapshot, "textChannelLog", message);
}

export function appendRtcTelopChannelLog(
    snapshot: DebugConsoleSnapshot,
    message: string,
): DebugConsoleSnapshot {
    return appendRtcChannelLog(snapshot, "telopChannelLog", message);
}

export function updateRtcState(
    snapshot: DebugConsoleSnapshot,
    key: RtcStateKey,
    state: string,
    append: boolean,
): DebugConsoleSnapshot {
    const previous = snapshot.rtc[key];
    const nextValue = append && previous ? `${previous} -> ${state}` : state;
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            [key]: nextValue,
        },
    };
}

export function updateRtcSdp(
    snapshot: DebugConsoleSnapshot,
    key: RtcSdpKey,
    message: string,
): DebugConsoleSnapshot {
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            [key]: message,
        },
    };
}

function appendRtcChannelLog(
    snapshot: DebugConsoleSnapshot,
    key: "textChannelLog" | "telopChannelLog",
    message: string,
): DebugConsoleSnapshot {
    return {
        ...snapshot,
        rtc: {
            ...snapshot.rtc,
            [key]: appendLimitedLog(snapshot.rtc[key], message, RTC_CHANNEL_LOG_LINES),
        },
    };
}

function appendLimitedLog(text: string, message: string, lines: number): string {
    return `${text}${message}`.split("\n").slice(-lines).join("\n");
}
