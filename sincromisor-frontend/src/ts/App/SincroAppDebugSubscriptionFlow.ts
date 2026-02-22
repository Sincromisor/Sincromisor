import type { DebugEventMapResult } from "./SincroAppEventMappers";
import type { SincroAppEvent } from "./SincroAppTypes";

export type SincroAppRtcDebugState = {
    iceConnectionState: string;
    signalingState: string;
};

type HandleMappedDebugEventParams = {
    result: DebugEventMapResult;
    rtcState: SincroAppRtcDebugState;
    emitEvent: (event: SincroAppEvent) => void;
    emitDerivedConnectionState: () => void;
};

// DebugConsoleManager 由来イベントのうち、RTC state 更新は AppController 側の保持状態更新と
// 派生 connection_state 通知が必要になるため、手順を helper に分離して再利用しやすくする。
export function handleMappedDebugConsoleEvent(params: HandleMappedDebugEventParams): SincroAppRtcDebugState {
    const { result, rtcState, emitEvent, emitDerivedConnectionState } = params;
    if (result.kind === "none") {
        return rtcState;
    }
    if (result.kind === "event") {
        emitEvent(result.event);
        return rtcState;
    }
    if (result.kind === "ice_state") {
        const nextState = { ...rtcState, iceConnectionState: result.value };
        emitEvent({ type: "rtc_state", iceConnectionState: result.value });
        emitDerivedConnectionState();
        return nextState;
    }
    const nextState = { ...rtcState, signalingState: result.value };
    emitEvent({ type: "rtc_state", signalingState: result.value });
    emitDerivedConnectionState();
    return nextState;
}
