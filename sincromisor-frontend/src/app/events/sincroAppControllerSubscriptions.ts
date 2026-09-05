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

/** 共有サービスの通知をアプリへ接続し、今回登録した購読だけをまとめて解除する関数を返す。 */
export function bindSincroAppControllerSubscriptions(
    params: SincroAppControllerSubscriptionParams,
): () => void {
    const unsubscribers = [
        bindChatServiceSubscription(params.chatMessageService, params.emitEvent),
        bindDebugManagerSubscription(params),
        bindTalkManagerSubscription(params.talkManager, params.emitEvent),
        bindPopServiceSubscription(params.popMessageService, params.emitEvent),
        bindDialogManagerSubscriptions(params),
    ];
    return () => {
        for (const unsubscribe of unsubscribers) {
            unsubscribe();
        }
    };
}
