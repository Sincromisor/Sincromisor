import { buildSincroAppConnectionStateEvent } from "./sincroAppConnectionState";
import { emitSincroAppConnectionState } from "./sincroAppEmitHelpers";
import type { SincroAppEvent, SincroAppLifecycleState } from "./sincroAppTypes";

type SincroAppControllerConnectionStateParams = {
    lifecycleState: SincroAppLifecycleState;
    iceConnectionState: string;
    signalingState: string;
};

export function buildSincroAppControllerConnectionStateEvent(
    params: SincroAppControllerConnectionStateParams,
): SincroAppEvent {
    return buildSincroAppConnectionStateEvent(params);
}

// ICE/signaling/lifecycle の保持状態から UI 向け connection_state を導出して通知する。
export function emitSincroAppControllerConnectionState(
    emitEvent: (event: SincroAppEvent) => void,
    params: SincroAppControllerConnectionStateParams,
): void {
    emitSincroAppConnectionState(emitEvent, buildSincroAppControllerConnectionStateEvent(params));
}
