import { afterEach, expect, it, vi } from "vitest";
import type { TelopChannelMessage } from "../../../rtc/rtcMessage";
import { TalkManager } from "../talkManager";

afterEach(() => vi.restoreAllMocks());

it("再バッファ後は同じモーラの残り時間だけ口形を戻し、文字とモーラIDを重複させない", () => {
    const now = vi.spyOn(performance, "now").mockReturnValue(0);
    const manager = TalkManager.getManager();
    const message: TelopChannelMessage = {
        speech_id: 41,
        timestamp: 1,
        text: "あ",
        vowel: "a",
        length: 0.2,
        message: "あ",
        new_text: true,
    };
    manager.addTelopChannelMessage(message);
    const moraID = manager.currentMora()?.moraID;
    now.mockReturnValue(300);
    expect(manager.currentMora()).toBeUndefined();
    manager.addTelopChannelMessage({ ...message, timestamp: 1.08, new_text: false });
    expect(manager.currentMora()?.moraID).toBe(moraID);
    expect(manager.currentMora()?.endTime).toBeCloseTo(420);
    expect(manager.getTelopTextSegmentsSnapshot()).toEqual([{ speechId: 41, text: "あ" }]);
    now.mockReturnValue(421);
    expect(manager.currentMora()).toBeUndefined();
    manager.addTelopChannelMessage({ ...message, speech_id: 42, new_text: false });
    manager.addTelopChannelMessage({ ...message, timestamp: 0.9, new_text: false });
    manager.addTelopChannelMessage({ ...message, timestamp: 1.3, new_text: false });
    expect(manager.currentMora()).toBeUndefined();
});
