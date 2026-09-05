import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { TelopChannelMessage } from "../../../../rtc/rtcMessage";
import { TalkManager } from "../../../talk/talkManager";
import { SincroTelopView } from "../sincroTelopView";

vi.mock("../../../../../app/controller", () => ({
    SincroAppController: {
        getCurrent: () => ({ state: TalkManager.getManager() }),
    },
}));
vi.mock("../../../../../app/react/subscribeActiveSincroAppEvents", () => ({
    subscribeActiveSincroAppEvents: vi.fn(),
}));

it("受信した発話履歴を初期描画し、空白・追加更新・口形同期・履歴制限を維持する", () => {
    const manager = TalkManager.getManager();
    const message: TelopChannelMessage = {
        speech_id: 1,
        text: "開始",
        new_text: true,
        length: 10,
        vowel: "a",
        timestamp: 0,
        message: "合成テロップ",
    };
    manager.addTelopChannelMessage(message);
    expect(renderToStaticMarkup(<SincroTelopView />)).toContain("開始");
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);
    manager.addTelopChannelMessage({ ...message, text: "" });
    manager.addTelopChannelMessage({ ...message, text: "追加" });
    expect(manager.getTelopTextSegmentsSnapshot()).toEqual([{ speechId: 1, text: "開始 追加" }]);
    expect(renderToStaticMarkup(<SincroTelopView />)).toContain("開始 追加");
    expect(manager.currentMora()).toMatchObject({ mora: { text: "追加" }, msec: 10000 });
    manager.addTelopChannelMessage({ ...message, new_text: false, text: "無視" });
    expect(manager.getTelopTextSegmentsSnapshot()[0].text).toBe("開始 追加");
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    listener.mockClear();
    for (let speech_id = 2; speech_id <= 8; speech_id++) {
        manager.addTelopChannelMessage({ ...message, speech_id, text: "あ".repeat(50) });
    }
    const segments = manager.getTelopTextSegmentsSnapshot();
    expect(segments.length).toBeLessThanOrEqual(6);
    expect(segments.reduce((sum, segment) => sum + segment.text.length, 0)).toBe(240);
    expect(listener).not.toHaveBeenCalled();
});
