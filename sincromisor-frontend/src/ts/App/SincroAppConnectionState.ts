import type { SincroAppEvent, SincroAppLifecycleState } from "./SincroAppTypes";

// DebugConsole 由来の ICE/signaling と App lifecycle を合成し、
// UI向けの単純化された接続状態イベントを生成する pure helper。
export function buildSincroAppConnectionStateEvent(params: {
    lifecycleState: SincroAppLifecycleState;
    iceConnectionState: string;
    signalingState: string;
}): SincroAppEvent {
    const ice = params.iceConnectionState.toLowerCase();
    const signaling = params.signalingState.toLowerCase();

    if (ice === "connected" || ice === "completed") {
        return { type: "connection_state", value: "connected", detail: `ice:${ice}` };
    }
    if (ice === "checking") {
        return { type: "connection_state", value: "connecting", detail: "ice:checking" };
    }
    if (ice === "failed" || ice === "disconnected") {
        return { type: "connection_state", value: "degraded", detail: `ice:${ice}` };
    }
    if (params.lifecycleState === "starting") {
        return { type: "connection_state", value: "starting" };
    }
    if (params.lifecycleState === "stopping") {
        return { type: "connection_state", value: "stopping" };
    }
    if (params.lifecycleState === "stopped") {
        return { type: "connection_state", value: "stopped" };
    }
    if (params.lifecycleState === "running") {
        return {
            type: "connection_state",
            value: "connecting",
            detail: signaling ? `signaling:${signaling}` : "running",
        };
    }
    return { type: "connection_state", value: "idle" };
}
