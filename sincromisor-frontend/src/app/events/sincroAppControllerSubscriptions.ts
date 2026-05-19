import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { TalkManager } from "../../features/conversation/talk/talkManager";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type { DialogManager } from "../../features/dialog/model/dialogManager";
import type { PopMessageService } from "../../features/dialog/model/popMessageService";
import {
    bindChatServiceSubscription,
    bindDebugManagerSubscription,
    bindDialogManagerSubscriptions,
    bindPopServiceSubscription,
    bindTalkManagerSubscription,
} from "../bridges/sincroAppManagerSubscriptionBinder";
import type { SincroAppEvent } from "../controller/sincroAppTypes";

type SincroAppControllerSubscriptionParams = {
    chatMessageService: ChatMessageService;
    debugConsoleManager: DebugConsoleManager;
    talkManager: TalkManager;
    popMessageService: PopMessageService;
    dialogManager: DialogManager;
    emitEvent: (event: SincroAppEvent) => void;
    emitDerivedConnectionState: () => void;
    emitSettingsRelatedSnapshots: () => void;
    getRtcState: () => {
        iceConnectionState: string;
        signalingState: string;
    };
    setRtcState: (state: { iceConnectionState: string; signalingState: string }) => void;
};

// singleton manager / service 群の購読を AppController 統一イベントへ正規化する。
// Controller 本体は購読順序の決定だけを持ち、各 manager 固有の橋渡しはここに集約する。
export function bindSincroAppControllerSubscriptions(
    params: SincroAppControllerSubscriptionParams,
): void {
    bindChatServiceSubscription(params.chatMessageService, params.emitEvent);
    bindDebugSubscriptions(params);
    bindTalkManagerSubscription(params.talkManager, params.emitEvent);
    bindPopServiceSubscription(params.popMessageService, params.emitEvent);
    bindDialogManagerSubscriptions({
        dialogManager: params.dialogManager,
        emitEvent: params.emitEvent,
        emitSettingsRelatedSnapshots: params.emitSettingsRelatedSnapshots,
    });
}

function bindDebugSubscriptions(params: SincroAppControllerSubscriptionParams): void {
    bindDebugManagerSubscription({
        debugConsoleManager: params.debugConsoleManager,
        emitEvent: params.emitEvent,
        emitDerivedConnectionState: params.emitDerivedConnectionState,
        getRtcState: params.getRtcState,
        setRtcState: params.setRtcState,
    });
}
