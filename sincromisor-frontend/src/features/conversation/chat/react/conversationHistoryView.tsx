import { useLayoutEffect, useRef, useState } from "react";
import { SettingsButton } from "../../../settings/react/primitives/settingsActionControls";
import { ChatMessageItem } from "./chatMessageItem";
import {
    type HistoryMessagePosition,
    historyIsAtLatest,
    historyScrollAdjustment,
} from "./historyScrollPosition";
import { useChatSnapshot } from "./useChatSnapshot";
import "./conversationHistory.css";

function readPositions(node: HTMLElement): HistoryMessagePosition[] {
    const top = node.getBoundingClientRect().top;
    return [...node.querySelectorAll<HTMLElement>("[data-message-id]")].map((item) => {
        const rect = item.getBoundingClientRect();
        return { id: item.dataset.messageId ?? "", top: rect.top - top, bottom: rect.bottom - top };
    });
}

/** 保持履歴を時系列で読み返す。末尾でだけ追従し、閲覧中は残る発話の位置とフォーカスを維持する。 */
export function ConversationHistoryView({ isVisible }: { isVisible: boolean }) {
    const { messages, systemIconUrl } = useChatSnapshot();
    const scrollRef = useRef<HTMLElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const following = useRef(true);
    const positions = useRef<HistoryMessagePosition[]>([]);
    const [atLatest, setAtLatest] = useState(true);
    // biome-ignore lint/correctness/useExhaustiveDependencies: 本文の同一ID更新後も、描画直後のDOM位置から閲覧位置を復元する。
    useLayoutEffect(() => {
        const node = scrollRef.current;
        const list = listRef.current;
        if (!isVisible || !node || !list) return;
        const restore = () => {
            if (following.current) node.scrollTop = node.scrollHeight;
            else node.scrollTop += historyScrollAdjustment(positions.current, readPositions(node));
            positions.current = readPositions(node);
        };
        restore();
        // 折り返しや文字拡大・画像読込でも、同じ発話の表示位置を保持する。
        const observer = new ResizeObserver(restore);
        observer.observe(list);
        return () => observer.disconnect();
    }, [isVisible, messages]);
    return (
        <section className="conversationHistory">
            <h2>会話履歴</h2>
            <section
                ref={scrollRef}
                className="conversationHistory__scroll"
                aria-label="会話履歴の本文"
                // biome-ignore lint/a11y/noNoninteractiveTabindex: 履歴を矢印・PageUp/Downでスクロールできるようにする。
                tabIndex={0}
                onScroll={() => {
                    const node = scrollRef.current;
                    if (!isVisible || !node) return;
                    following.current = historyIsAtLatest(node);
                    setAtLatest(following.current);
                    positions.current = readPositions(node);
                }}
            >
                <div ref={listRef} className="conversationHistory__list">
                    {[...messages]
                        .reverse()
                        .filter((item) => item.message.message_type !== "error")
                        .map((record) => (
                            <ChatMessageItem
                                key={record.message.message_id}
                                record={record}
                                systemIconUrl={systemIconUrl}
                                idPrefix="history-msg"
                            />
                        ))}
                </div>
            </section>
            {!atLatest ? (
                <SettingsButton
                    type="button"
                    onClick={() => {
                        const node = scrollRef.current;
                        if (!node) return;
                        following.current = true;
                        node.scrollTop = node.scrollHeight;
                        node.focus({ preventScroll: true });
                        setAtLatest(true);
                    }}
                >
                    最新へ
                </SettingsButton>
            ) : null}
        </section>
    );
}
