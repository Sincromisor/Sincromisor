import { useSyncExternalStore } from "react";
import type { ChatMessageViewRecord } from "../../../../app/controller";
import {
    SincroAppController,
    subscribeActiveSincroAppController,
} from "../../../../app/controller";
import type { ChatMessage } from "../../../rtc/rtcMessage";
import type { ChatMessageSnapshot } from "../model/chatMessageService";

function messageTypeToClassName(messageType: string): string {
    const name = messageType.charAt(0).toUpperCase() + messageType.slice(1);
    return `sincro${name}Message`;
}

function iconUrlForMessage(message: ChatMessage, systemIconUrl: string): string {
    if (message.message_type === "system") {
        return systemIconUrl;
    }
    return `../images/icon-${message.message_type}.webp`;
}

function canRenderHtml(record: ChatMessageViewRecord): boolean {
    if (record.renderMode !== "trusted_html") {
        return false;
    }
    // HTMLの信頼境界:
    // - HTML描画は既存互換が必要な system / reset のみに限定
    // - user / error は text として扱い、想定外HTMLの混入リスクを下げる
    return record.message.message_type === "system" || record.message.message_type === "reset";
}

/** 保持済み履歴と以後の通知から、共通チャット欄を描画する。 */
export function SincroChatView() {
    const { messages, systemIconUrl } = useSincroChatViewState();

    return (
        <>
            {messages.map((record) => (
                <ChatMessageItem
                    key={record.message.message_id}
                    record={record}
                    systemIconUrl={systemIconUrl}
                />
            ))}
        </>
    );
}

const emptySnapshot: ChatMessageSnapshot = {
    messages: [],
    systemIconUrl: "../images/icon-system.webp",
};

function getChatSnapshot(): ChatMessageSnapshot {
    return SincroAppController.getCurrent()?.chat.getSnapshot() ?? emptySnapshot;
}

// 有効制御の差し替え時は旧サービス購読を外し、共有履歴の現在値から表示し直す。
function subscribeChatSnapshot(listener: () => void): () => void {
    return subscribeActiveSincroAppController((controller) => {
        listener();
        return controller?.chat.subscribeSnapshot(listener);
    });
}

function useSincroChatViewState(): ChatMessageSnapshot {
    return useSyncExternalStore(subscribeChatSnapshot, getChatSnapshot, getChatSnapshot);
}

function ChatMessageItem({
    record,
    systemIconUrl,
}: {
    record: ChatMessageViewRecord;
    systemIconUrl: string;
}) {
    return (
        <div
            id={`msg${record.message.message_id}`}
            className={`${messageTypeToClassName(record.message.message_type)} sincroMessage`}
            // 既存CSSでは初期opacity=0のため、React描画では明示的に表示状態にする。
            style={{ opacity: 1 }}
        >
            <div className="sincroMessage__iconBox">
                <img
                    className="sincroMessage__icon"
                    src={iconUrlForMessage(record.message, systemIconUrl)}
                    alt=""
                />
            </div>
            {canRenderHtml(record) ? (
                // 明示的に許可したシステム・リセットメッセージだけHTMLとして描画する。
                <p
                    className="sincroMessage__text"
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted_html は system/reset の既存互換HTMLだけを許可している。
                    dangerouslySetInnerHTML={{ __html: record.message.message }}
                />
            ) : (
                <p className="sincroMessage__text">{record.message.message}</p>
            )}
        </div>
    );
}
