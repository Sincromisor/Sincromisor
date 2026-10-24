import { ChatMessageItem } from "./chatMessageItem";
import { useChatSnapshot } from "./useChatSnapshot";

/** 保持済み履歴と以後の通知から、共通チャット欄を描画する。 */
export function SincroChatView() {
    const { messages, systemIconUrl } = useChatSnapshot();

    return (
        <>
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
