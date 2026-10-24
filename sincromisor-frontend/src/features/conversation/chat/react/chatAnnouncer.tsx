import { useEffect, useState } from "react";
import { subscribeActiveSincroAppEvents } from "../../../../app/react/subscribeActiveSincroAppEvents";
import { ChatAnnouncementQueue } from "./chatAnnouncementQueue";

/** 会話の新着だけを別のlive領域へ送り、履歴やテロップの描画更新を読み上げ対象にしない。 */
export function ChatAnnouncer() {
    const [announcement, setAnnouncement] = useState({ sequence: 0, text: "" });
    useEffect(() => {
        let queue: ChatAnnouncementQueue | undefined;
        const stop = subscribeActiveSincroAppEvents({
            onControllerChange: (controller) => {
                queue?.dispose();
                queue = new ChatAnnouncementQueue(
                    controller?.chat
                        .getSnapshot()
                        .messages.map((item) => item.message.message_id) ?? [],
                    (text) =>
                        setAnnouncement((previous) => ({ sequence: previous.sequence + 1, text })),
                );
            },
            onEvent: (event, controller) => {
                if (event.type !== "chat_message" && event.type !== "system_message") return;
                queue?.receive(
                    event.viewRecord,
                    controller.chat.getSnapshot().messages.map((item) => item.message.message_id),
                );
            },
        });
        return () => {
            stop();
            queue?.dispose();
        };
    }, []);
    return (
        <div className="sincroChatAnnouncement" aria-live="polite" aria-atomic="true">
            <span key={announcement.sequence}>{announcement.text}</span>
        </div>
    );
}
