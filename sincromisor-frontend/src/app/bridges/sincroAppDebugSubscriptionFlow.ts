import type { SincroAppEvent } from "../controller/sincroAppTypes";
import type { DebugEventMapResult } from "../events/sincroAppEventMappers";

/** 接続表示の導出と新規購読への初期通知で共有する、最新のRTC診断状態。 */
export type SincroAppRtcDebugState = {
    iceConnectionState: string;
    signalingState: string;
};

type HandleMappedDebugEventParams = {
    result: DebugEventMapResult;
    rtcState: SincroAppRtcDebugState;
    setRtcState: (state: SincroAppRtcDebugState) => void;
    emitEvent: (event: SincroAppEvent) => void;
    emitDerivedConnectionState: () => void;
};

/** 診断由来のRTC状態を先に保存し、同期購読と派生接続状態が同じ最新値を参照できる順序で通知する。 */
export function handleMappedDebugConsoleEvent(params: HandleMappedDebugEventParams): void {
    const { result, rtcState, emitEvent, emitDerivedConnectionState } = params;
    if (result.kind === "none") {
        return;
    }
    if (result.kind === "event") {
        emitEvent(result.event);
        return;
    }
    if (result.kind === "ice_state") {
        const nextState = { ...rtcState, iceConnectionState: result.value };
        params.setRtcState(nextState);
        emitEvent({ type: "rtc_state", iceConnectionState: result.value });
        emitDerivedConnectionState();
        return;
    }
    const nextState = { ...rtcState, signalingState: result.value };
    params.setRtcState(nextState);
    emitEvent({ type: "rtc_state", signalingState: result.value });
    emitDerivedConnectionState();
}
