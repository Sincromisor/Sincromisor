import {
    handleMappedDebugConsoleEvent,
    type SincroAppRtcDebugState,
} from "./sincroAppDebugSubscriptionFlow";
import {
    mapChatMessageToAppEvent,
    mapDebugConsoleEvent,
    mapTalkManagerEventToAppEvent,
} from "./sincroAppEventMappers";
import type {
    SincroAppChatSubscriptionFacade,
    SincroAppDebugSubscriptionFacade,
    SincroAppDialogSubscriptionFacade,
    SincroAppPopSubscriptionFacade,
    SincroAppTalkSubscriptionFacade,
} from "./sincroAppManagerSubscriptionFacades";
import type { SincroAppEvent } from "./sincroAppTypes";

type EmitFn = (event: SincroAppEvent) => void;

type DebugSubscriptionParams = {
    debugConsoleManager: SincroAppDebugSubscriptionFacade;
    emitEvent: EmitFn;
    emitDerivedConnectionState: () => void;
    getRtcState: () => SincroAppRtcDebugState;
    setRtcState: (state: SincroAppRtcDebugState) => void;
};

type DialogSubscriptionParams = {
    dialogManager: SincroAppDialogSubscriptionFacade;
    emitEvent: EmitFn;
    emitSettingsRelatedSnapshots: () => void;
};

// manager / service 群の subscribe 本文を helper 側へ分離し、SincroAppController を orchestration 中心に保つ。
export function bindChatServiceSubscription(
    chatMessageService: SincroAppChatSubscriptionFacade,
    emitEvent: EmitFn,
): void {
    chatMessageService.subscribe((event) => {
        const appEvent = mapChatMessageToAppEvent(event);
        if (!appEvent) {
            return;
        }
        emitEvent(appEvent);
    });
}

export function bindDebugManagerSubscription(params: DebugSubscriptionParams): void {
    params.debugConsoleManager.subscribe((event) => {
        // debugイベントは単純な 1:1 変換だけでなく、
        // 1) ICE/signaling の保持状態更新
        // 2) rtc_state emit
        // 3) connection_state 再計算 emit
        // の順序制御が必要なため、helper から「次の保持状態」を返す形にしている。
        const nextRtcState = handleMappedDebugConsoleEvent({
            result: mapDebugConsoleEvent(event),
            rtcState: params.getRtcState(),
            emitEvent: params.emitEvent,
            emitDerivedConnectionState: params.emitDerivedConnectionState,
        });
        params.setRtcState(nextRtcState);
    });
}

export function bindTalkManagerSubscription(
    talkManager: SincroAppTalkSubscriptionFacade,
    emitEvent: EmitFn,
): void {
    talkManager.subscribe((event) => {
        const appEvent = mapTalkManagerEventToAppEvent(event);
        if (appEvent) {
            emitEvent(appEvent);
        }
    });
}

export function bindPopServiceSubscription(
    popMessageService: SincroAppPopSubscriptionFacade,
    emitEvent: EmitFn,
): void {
    // dialog 内 pop も AppEvent 化して、React が PopMessageService singleton を直接購読しない構成へ寄せる。
    popMessageService.subscribeDialogPop((message) => {
        emitEvent({ type: "dialog_pop_message", message });
    });
}

export function bindDialogManagerSubscriptions(params: DialogSubscriptionParams): void {
    // DialogManager の個別変更通知を AppController snapshot 再通知へ変換する。
    params.dialogManager.subscribeSettingsChange(() => {
        params.emitSettingsRelatedSnapshots();
    });
    params.dialogManager.subscribeDialogUiState((uiState) => {
        params.emitEvent({ type: "dialog_ui_state", uiState });
    });
    params.dialogManager.subscribeVrmUiState((uiState) => {
        params.emitEvent({ type: "dialog_vrm_ui_state", uiState });
    });
}
