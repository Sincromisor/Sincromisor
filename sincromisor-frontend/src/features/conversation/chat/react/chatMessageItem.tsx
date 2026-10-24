import { useId } from "react";
import type { ChatMessageViewRecord } from "../../../../app/controller";
import type { ChatMessage } from "../../../rtc/rtcMessage";
import { chatSpeakerName } from "./chatAnnouncementQueue";

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

/** 通常会話と履歴で同じ話者・本文を描画し、配置ごとにDOMの識別子を分ける。 */
export function ChatMessageItem({
    record,
    systemIconUrl,
    idPrefix = "msg",
}: {
    record: ChatMessageViewRecord;
    systemIconUrl: string;
    idPrefix?: string;
}) {
    const speakerId = useId();
    return (
        <article
            aria-labelledby={speakerId}
            id={`${idPrefix}${record.message.message_id}`}
            data-message-id={record.message.message_id}
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
