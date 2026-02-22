import { useEffect, useState } from "react";
import type { ChatMessage } from "../../ts/RTC/RTCMessage";
import {
    ChatMessageManager,
    type ChatMessageViewRecord,
} from "../../ts/UI/ChatMessageManager";

type SincroChatViewProps = {
    enableReactRendering?: boolean;
};

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
    // 移行期間の安全方針:
    // - HTML描画は既存互換が必要な system / reset のみに限定
    // - user / error は text として扱い、想定外HTMLの混入リスクを下げる
    return record.message.message_type === "system" || record.message.message_type === "reset";
}

// 既存のチャットCSS(class名)を再利用して、描画だけ React へ移す。
export function SincroChatView({ enableReactRendering = true }: SincroChatViewProps) {
    const [messages, setMessages] = useState<ChatMessageViewRecord[]>([]);
    const [systemIconUrl, setSystemIconUrl] = useState<string>("../images/icon-system.webp");

    useEffect(() => {
        const chatManager = ChatMessageManager.getManager();
        setSystemIconUrl(chatManager.getSystemIconUrl());
        setMessages(chatManager.getMessageViewSnapshot());
        if (enableReactRendering) {
            chatManager.setDomRenderingEnabled(false);
        }

        const unsubscribe = chatManager.subscribe((event) => {
            if (event.type === "system_icon_changed" && event.systemIconUrl) {
                setSystemIconUrl(event.systemIconUrl);
                return;
            }
            if (event.type !== "message" || !event.viewRecord) {
                return;
            }
            setMessages((prev) => {
                const index = prev.findIndex((m) => m.message.message_id === event.viewRecord!.message.message_id);
                if (index >= 0) {
                    const next = [...prev];
                    next[index] = event.viewRecord!;
                    return next;
                }
                return [event.viewRecord!, ...prev].slice(0, 30);
            });
        });

        return () => {
            unsubscribe();
        };
    }, [enableReactRendering]);

    return (
        <>
            {messages.map((record) => (
                <div
                    key={record.message.message_id}
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
                        // 移行期間の方針: 許可した種別のみ既存互換のHTML描画を行う。
                        <p className="sincroMessage__text" dangerouslySetInnerHTML={{ __html: record.message.message }} />
                    ) : (
                        <p className="sincroMessage__text">{record.message.message}</p>
                    )}
                </div>
            ))}
        </>
    );
}
