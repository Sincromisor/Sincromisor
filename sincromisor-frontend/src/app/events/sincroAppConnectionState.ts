import type { SincroAppEvent, SincroAppLifecycleState } from "../controller/sincroAppTypes";

/** 停止中・停止済みの操作状態を優先し、残った診断値で接続中へ戻さずUI向け接続状態へ変換する。 */
export function buildSincroAppConnectionStateEvent(params: {
    lifecycleState: SincroAppLifecycleState;
    iceConnectionState: string;
    signalingState: string;
}): SincroAppEvent {
    if (params.lifecycleState === "stopping") {
        return { type: "connection_state", value: "stopping" };
    }
    if (params.lifecycleState === "stopped") {
        return { type: "connection_state", value: "stopped" };
    }
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
    if (params.lifecycleState === "running") {
        return {
            type: "connection_state",
            value: "connecting",
            detail: signaling ? `signaling:${signaling}` : "running",
        };
    }
    return { type: "connection_state", value: "idle" };
}
