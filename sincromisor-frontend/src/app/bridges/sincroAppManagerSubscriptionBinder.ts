import type { SincroAppEvent } from "../controller/sincroAppTypes";
import {
    mapChatMessageToAppEvent,
    mapDebugConsoleEvent,
    mapTalkManagerEventToAppEvent,
} from "../events/sincroAppEventMappers";
import {
    handleMappedDebugConsoleEvent,
    type SincroAppRtcDebugState,
} from "./sincroAppDebugSubscriptionFlow";
import type {
    SincroAppChatSubscriptionFacade,
    SincroAppDebugSubscriptionFacade,
    SincroAppDialogSubscriptionFacade,
    SincroAppPopSubscriptionFacade,
    SincroAppTalkSubscriptionFacade,
} from "./sincroAppManagerSubscriptionFacades";

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

/** チャット通知をアプリイベントへ変換し、この購読だけを解除する関数を返す。 */
export function bindChatServiceSubscription(
    chatMessageService: SincroAppChatSubscriptionFacade,
    emitEvent: EmitFn,
): () => void {
    return chatMessageService.subscribe((event) => {
        const appEvent = mapChatMessageToAppEvent(event);
        if (!appEvent) {
            return;
        }
        emitEvent(appEvent);
    });
}

/** 診断通知を接続状態とアプリイベントへ反映し、購読解除関数を返す。 */
export function bindDebugManagerSubscription(params: DebugSubscriptionParams): () => void {
    return params.debugConsoleManager.subscribe((event) => {
        // 診断通知はRTC状態の保持と接続状態の再計算も伴うため、
        // 通知処理から返る次の保持状態を制御処理へ反映する。
        const nextRtcState = handleMappedDebugConsoleEvent({
            result: mapDebugConsoleEvent(event),
            rtcState: params.getRtcState(),
            emitEvent: params.emitEvent,
            emitDerivedConnectionState: params.emitDerivedConnectionState,
        });
        params.setRtcState(nextRtcState);
    });
}

/** テロップ通知をアプリイベントへ変換し、購読解除関数を返す。 */
export function bindTalkManagerSubscription(
    talkManager: SincroAppTalkSubscriptionFacade,
    emitEvent: EmitFn,
): () => void {
    return talkManager.subscribe((event) => {
        const appEvent = mapTalkManagerEventToAppEvent(event);
        if (appEvent) {
            emitEvent(appEvent);
        }
    });
}

/** ダイアログの案内通知をアプリへ接続し、購読解除関数を返す。 */
export function bindPopServiceSubscription(
    popMessageService: SincroAppPopSubscriptionFacade,
    emitEvent: EmitFn,
): () => void {
    // ダイアログの案内もアプリイベントへ統合し、Reactの購読先を制御処理に揃える。
    return popMessageService.subscribeDialogPop((message) => {
        emitEvent({ type: "dialog_pop_message", message });
    });
}

/** 設定・ダイアログ・VRMの通知を接続し、3件の購読をまとめて解除する関数を返す。 */
export function bindDialogManagerSubscriptions(params: DialogSubscriptionParams): () => void {
    // ダイアログの個別変更通知を、アプリの状態スナップショットとして再通知する。
    const unsubscribeSettings = params.dialogManager.subscribeSettingsChange(() => {
        params.emitSettingsRelatedSnapshots();
    });
    const unsubscribeDialog = params.dialogManager.subscribeDialogUiState((uiState) => {
        params.emitEvent({ type: "dialog_ui_state", uiState });
    });
    const unsubscribeVrm = params.dialogManager.subscribeVrmUiState((uiState) => {
        params.emitEvent({ type: "dialog_vrm_ui_state", uiState });
    });
    return () => {
        unsubscribeSettings();
        unsubscribeDialog();
        unsubscribeVrm();
    };
}
