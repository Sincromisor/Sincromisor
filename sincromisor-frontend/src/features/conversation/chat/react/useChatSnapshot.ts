import { useSyncExternalStore } from "react";
import { getActiveSincroAppController } from "../../../../app/controller/activeSincroAppController";
import { subscribeActiveSincroAppController } from "../../../../app/controller/subscribeActiveSincroAppController";
import type { ChatMessageSnapshot } from "../model/chatMessageService";

const emptySnapshot: ChatMessageSnapshot = {
    messages: [],
    systemIconUrl: "../images/icon-system.webp",
};
function getSnapshot(): ChatMessageSnapshot {
    return getActiveSincroAppController()?.chat.getSnapshot() ?? emptySnapshot;
}
function subscribe(listener: () => void): () => void {
    return subscribeActiveSincroAppController((controller) => {
        listener();
        return controller?.chat.subscribeSnapshot(listener);
    });
}

/** 会話と重要通知で同じ正本を読み、有効アプリの差し替え時は旧購読を解除する。 */
export function useChatSnapshot(): ChatMessageSnapshot {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
