import { useEffect, useState } from "react";
import type { ChatMessage } from "../../ts/RTC/RTCMessage";
import type { ChatMessageViewRecord, SincroAppEvent } from "../../ts/App/SincroAppTypes";
import { SincroAppController } from "../../ts/App/SincroAppController";
import { subscribeActiveSincroAppEvents } from "../app/subscribeActiveSincroAppEvents";

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
    const initialController = SincroAppController.getCurrent();
    const [messages, setMessages] = useState<ChatMessageViewRecord[]>(
        initialController?.chat.getMessageViewSnapshot() ?? [],
    );
    const [systemIconUrl, setSystemIconUrl] = useState<string>(
        initialController?.chat.getSystemIconUrl() ?? "../images/icon-system.webp",
    );

    useEffect(() => {
        const applyChatViewRecord = (event: Extract<SincroAppEvent, {
            type: "chat_message" | "system_message" | "error_message";
        }>) => {
            setMessages((prev) => {
                const index = prev.findIndex((m) => m.message.message_id === event.viewRecord.message.message_id);
                if (index >= 0) {
                    const next = [...prev];
                    next[index] = event.viewRecord;
                    return next;
                }
                return [event.viewRecord, ...prev].slice(0, 30);
            });
        };

        const unsubscribe = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                if (!controller) {
                    setMessages([]);
                    setSystemIconUrl("../images/icon-system.webp");
                    return;
                }
                setMessages(controller.chat.getMessageViewSnapshot());
                setSystemIconUrl(controller.chat.getSystemIconUrl());
            },
            onBeforeSubscribe: (controller) => {
                if (enableReactRendering) {
                    controller.chat.setDomRenderingEnabled(false);
                }
            },
            onCleanupController: (controller) => {
                if (enableReactRendering) {
                    controller.chat.setDomRenderingEnabled(true);
                }
            },
            onEvent: (event) => {
                if (event.type === "chat_system_icon") {
                    setSystemIconUrl(event.iconUrl);
                    return;
                }
                if (
                    event.type === "chat_message"
                    || event.type === "system_message"
                    || event.type === "error_message"
                ) {
                    applyChatViewRecord(event);
                }
            },
        });

        return unsubscribe;
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
