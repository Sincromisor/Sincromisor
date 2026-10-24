import { afterEach, expect, it, vi } from "vitest";
import type { ChatMessageViewRecord } from "../../model/chatMessageService";
import { ChatAnnouncementQueue, chatSpeakerName } from "../chatAnnouncementQueue";

function record(id: string, text: string, name = "話し手", kind = "user"): ChatMessageViewRecord {
    return {
        renderMode: "text",
        message: {
            message_id: id,
            message: text,
            speaker_name: name,
            speaker_id: "speaker",
            speech_id: 1,
            message_type: kind,
            created_at: 1,
        },
    };
}
afterEach(() => vi.useRealTimers());

it("初期履歴を除き、新規IDの連続更新をまとめ、通知後の更新と取り外しを再通知しない", () => {
    vi.useFakeTimers();
    const announce = vi.fn();
    const queue = new ChatAnnouncementQueue(["old"], announce);
    queue.receive(record("old", "再表示"), ["old"]);
    queue.receive(record("new", "に"), ["old", "new"]);
    vi.advanceTimersByTime(300);
    queue.receive(record("new", "日本語の発話"), ["old", "new"]);
    vi.advanceTimersByTime(600);
    expect(announce).toHaveBeenCalledExactlyOnceWith("話し手: 日本語の発話");
    queue.receive(record("new", "後から増えた本文"), ["old", "new"]);
    queue.receive(record("error", "エラー", "", "error"), ["old", "new", "error"]);
    vi.advanceTimersByTime(1000);
    expect(announce).toHaveBeenCalledOnce();
    queue.receive(record("next", "後続"), ["new", "next"]);
    queue.dispose();
    vi.advanceTimersByTime(1000);
    expect(announce).toHaveBeenCalledOnce();
    const reconnected = new ChatAnnouncementQueue(["new", "next"], announce);
    reconnected.receive(record("next", "再購読後の更新"), ["new", "next"]);
    vi.advanceTimersByTime(1000);
    expect(announce).toHaveBeenCalledOnce();
    reconnected.dispose();
});
it("実名と最小の代替名を使い、system発話とサービス通知を区別する", () => {
    expect(chatSpeakerName(record("1", "", ""))).toBe("あなた");
    expect(chatSpeakerName(record("1", "", "Unknown User"))).toBe("あなた");
    expect(chatSpeakerName(record("1", "", "", "system"))).toBe("キャラクター");
    expect(chatSpeakerName(record("1", "", "葵", "system"))).toBe("葵");
    expect(chatSpeakerName(record("1", "", "", "reset"))).toBe("サービス（通知）");
});
