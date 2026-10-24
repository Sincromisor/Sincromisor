import type { ChatMessageViewRecord } from "../model/chatMessageService";

/** 実名を優先し、機械側の代替名とサービス通知だけを表示用の話者名へ変換する。 */
export function chatSpeakerName(record: ChatMessageViewRecord): string {
    const { message_type: kind, speaker_name: name } = record.message;
    if (kind === "error") return "サービスのエラー";
    if (kind === "reset") return `${name.trim() || "サービス"}（通知）`;
    if (name.trim() && name !== "Unknown User") return name;
    return kind === "user" ? "あなた" : "キャラクター";
}

/** 新しいIDだけを通知し、600ms以内の更新をまとめる。静穏期間は発話の確定を意味しない。 */
export class ChatAnnouncementQueue {
    private seen: Set<string>;
    private readonly pending = new Map<string, ChatMessageViewRecord>();
    private timer?: ReturnType<typeof setTimeout>;
    constructor(
        initialIds: readonly string[],
        private readonly announce: (text: string) => void,
    ) {
        this.seen = new Set(initialIds);
    }

    /** 同一IDの更新は通知待ちの間だけ差し替え、保持履歴から外れたIDは記憶し続けない。 */
    receive(record: ChatMessageViewRecord, currentIds: readonly string[]): void {
        const id = record.message.message_id;
        const isNew = !this.seen.has(id);
        this.seen = new Set(currentIds);
        if (record.message.message_type === "error" || (!isNew && !this.pending.has(id))) return;
        this.pending.set(id, record);
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            const text = [...this.pending.values()]
                .filter((item) => item.message.message.trim())
                .map(
                    (item) =>
                        `${chatSpeakerName(item)}: ${item.renderMode === "trusted_html" ? "新しい通知" : item.message.message}`,
                )
                .join("\n");
            this.pending.clear();
            if (text) this.announce(text);
        }, 600);
    }

    /** 再購読や取り外しで、旧履歴の遅れた読み上げを残さない。 */
    dispose(): void {
        clearTimeout(this.timer);
        this.pending.clear();
    }
}
