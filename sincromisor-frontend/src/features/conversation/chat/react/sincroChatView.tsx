import { useId } from "react";
import type { ChatMessageViewRecord } from "../../../../app/controller";
import type { ChatMessage } from "../../../rtc/rtcMessage";
import { chatSpeakerName } from "./chatAnnouncementQueue";
import { ChatAnnouncer } from "./chatAnnouncer";
import { useChatSnapshot } from "./useChatSnapshot";

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
    const { messages, systemIconUrl } = useChatSnapshot();

    return (
        <>
            <ChatAnnouncer />
            {messages
                .filter((record) => record.message.message_type !== "error")
                .map((record) => (
                    <ChatMessageItem
                        key={record.message.message_id}
                        record={record}
                        systemIconUrl={systemIconUrl}
                    />
                ))}
        </>
    );
}

function ChatMessageItem({
    record,
    systemIconUrl,
}: {
    record: ChatMessageViewRecord;
    systemIconUrl: string;
}) {
    const speakerId = useId();
    return (
        <article
            aria-labelledby={speakerId}
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
            <div className="sincroMessage__text">
                <div id={speakerId} className="sincroMessage__speaker">
                    {chatSpeakerName(record)}
                </div>
                {canRenderHtml(record) ? (
                    // biome-ignore lint/security/noDangerouslySetInnerHtml: system/resetの既存trusted_htmlだけを描画する。
                    <p dangerouslySetInnerHTML={{ __html: record.message.message }} />
                ) : (
                    <p>{record.message.message}</p>
                )}
            </div>
        </article>
    );
}
