import type { DebugConsoleManagerEvent } from "./debugConsolePublicTypes";
import {
    appendRtcEventLog,
    appendRtcTelopChannelLog,
    appendRtcTextChannelLog,
    isDebugConsoleMetricKey,
    isDebugConsoleTrendKey,
    pushRtcTrendPoint,
    resetRtcRealtimeStats,
    updateRtcMetric,
    updateRtcSdp,
    updateRtcState,
} from "./debugConsoleRtcSnapshot";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type DebugConsoleRtcControlsParams = {
    updateSnapshot: (updater: (snapshot: DebugConsoleSnapshot) => DebugConsoleSnapshot) => void;
    emitEvent: (event: DebugConsoleManagerEvent) => void;
};

type RtcStateKey = "iceConnectionState" | "iceGatheringState" | "signalingState";

// RTC 診断の snapshot 更新と event 発行をまとめる。
// DebugConsoleManager は既存 API の入口に残し、RTC 固有の key 判定とログ追記はここで完結させる。
export class DebugConsoleRtcControls {
    constructor(private readonly params: DebugConsoleRtcControlsParams) {}

    resetRealtimeStats(): void {
        this.params.updateSnapshot(resetRtcRealtimeStats);
    }

    updateMetricValue(key: string, value: string): void {
        if (!isDebugConsoleMetricKey(key)) {
            return;
        }
        this.params.updateSnapshot((snapshot) => updateRtcMetric(snapshot, key, value));
    }

    pushTrendPoint(trendKey: string, value: number | undefined): void {
        if (!isDebugConsoleTrendKey(trendKey)) {
            return;
        }
        this.params.updateSnapshot((snapshot) => pushRtcTrendPoint(snapshot, trendKey, value));
    }

    addRtcEventLog(msg: string): void {
        this.params.updateSnapshot((snapshot) => appendRtcEventLog(snapshot, msg));
        this.params.emitEvent({ type: "rtc_event_log", message: msg });
    }

    addTelopChannelLog(msg: string): void {
        this.params.updateSnapshot((snapshot) => appendRtcTelopChannelLog(snapshot, msg));
    }

    addTextChannelLog(msg: string): void {
        this.params.updateSnapshot((snapshot) => appendRtcTextChannelLog(snapshot, msg));
    }

    newIceConnectionState(msg: string): void {
        this.updateRtcStateSnapshot("iceConnectionState", msg, true);
        this.addRtcEventLog(`ICE connection state -> ${msg}`);
        this.params.emitEvent({ type: "ice_connection_state", value: msg });
    }

    updateIceConnectionState(msg: string): void {
        this.updateRtcStateSnapshot("iceConnectionState", msg, false);
        this.params.emitEvent({ type: "ice_connection_state", value: msg });
    }

    newIceGatheringState(msg: string): void {
        this.updateRtcStateSnapshot("iceGatheringState", msg, true);
        this.addRtcEventLog(`ICE gathering state -> ${msg}`);
    }

    updateIceGatheringState(msg: string): void {
        this.updateRtcStateSnapshot("iceGatheringState", msg, false);
    }

    newSignalingState(msg: string): void {
        this.updateRtcStateSnapshot("signalingState", msg, true);
        this.addRtcEventLog(`Signaling state -> ${msg}`);
        this.params.emitEvent({ type: "signaling_state", value: msg });
    }

    updateSignalingState(msg: string): void {
        this.updateRtcStateSnapshot("signalingState", msg, false);
        this.params.emitEvent({ type: "signaling_state", value: msg });
    }

    offerSDP(msg: string): void {
        this.params.updateSnapshot((snapshot) => updateRtcSdp(snapshot, "offerSdp", msg));
    }

    answerSDP(msg: string): void {
        this.params.updateSnapshot((snapshot) => updateRtcSdp(snapshot, "answerSdp", msg));
    }

    private updateRtcStateSnapshot(key: RtcStateKey, state: string, append: boolean): void {
        this.params.updateSnapshot((snapshot) => updateRtcState(snapshot, key, state, append));
    }
}
