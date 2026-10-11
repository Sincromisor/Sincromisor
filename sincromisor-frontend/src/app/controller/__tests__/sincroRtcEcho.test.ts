import { expect, it, vi } from "vitest";
import type { TelopChannelMessage } from "../../../features/rtc/rtcMessage";
import { SincroRtcSessionController } from "../sincroRtcSessionController";

const clients = vi.hoisted(() => {
    const list: Array<{
        setMute: ReturnType<typeof vi.fn>;
        stop: ReturnType<typeof vi.fn>;
        telopChannelCallback?: (message: TelopChannelMessage) => void;
    }> = [];
    return list;
});
vi.mock("../../../features/rtc/rtcTalkClient", () => ({
    RTCTalkClient: class {
        setMute = vi.fn();
        stop = vi.fn();
        start = vi.fn();
        constructor() {
            clients.push(this);
        }
    },
}));

it.each(["echo", "playback"])(
    "%sは自動ミュートを無視し、手動操作を維持して通常モードへ復帰する",
    (mode) => {
        const controller = new SincroRtcSessionController(
            { setLocalAudioTrack: vi.fn() },
            { addTextChannelMessage: vi.fn(), addTelopChannelMessage: vi.fn() },
            {
                config: { offerURL: "/offer", candidateURL: "/candidate", iceServers: [] },
            },
        );
        const track: MediaStreamTrack = Object.assign(Object.create(EventTarget.prototype), {
            kind: "audio",
        });

        controller.start(track, mode);
        const echo = clients[clients.length - 1];
        controller.setAutoMute(true);
        expect(echo.setMute).toHaveBeenLastCalledWith(false);
        controller.setManualMute(true);
        controller.setAutoMute(false);
        expect(echo.setMute).toHaveBeenLastCalledWith(true);
        controller.setManualMute(false);
        expect(echo.setMute).toHaveBeenLastCalledWith(false);
        controller.stop();
        expect(echo.stop).toHaveBeenCalledOnce();
        controller.start(track, "chat");
        const chat = clients[clients.length - 1];
        controller.setAutoMute(true);
        expect(chat.setMute).toHaveBeenLastCalledWith(true);
        controller.setManualMute(true);
        controller.setAutoMute(false);
        expect(chat.setMute).toHaveBeenLastCalledWith(true);
        controller.setManualMute(false);
        expect(chat.setMute).toHaveBeenLastCalledWith(false);
        controller.stop();
    },
);

it("playbackの旧周回・過去時刻を表示へ戻さず再接続時は判定をリセットする", () => {
    const addTelopChannelMessage = vi.fn();
    const controller = new SincroRtcSessionController(
        { setLocalAudioTrack: vi.fn() },
        { addTextChannelMessage: vi.fn(), addTelopChannelMessage },
        { config: { offerURL: "/offer", candidateURL: "/candidate", iceServers: [] } },
    );
    const track: MediaStreamTrack = Object.assign(Object.create(EventTarget.prototype), {
        kind: "audio",
    });
    controller.start(track, "playback");
    const message = (speech_id: number, timestamp: number): TelopChannelMessage => ({
        speech_id,
        timestamp,
        message: "確認",
        text: "か",
        vowel: "a",
        length: 0.1,
        new_text: true,
    });
    const callback = clients[clients.length - 1]?.telopChannelCallback;
    callback?.(message(1, 3));
    callback?.(message(2, 0));
    callback?.(message(1, 3.5));
    callback?.(message(2, 0.5));
    callback?.(message(2, 0.2));
    expect(addTelopChannelMessage).toHaveBeenCalledTimes(3);
    controller.stop();
    controller.start(track, "playback");
    clients[clients.length - 1]?.telopChannelCallback?.(message(1, 0));
    expect(addTelopChannelMessage).toHaveBeenCalledTimes(4);
    controller.stop();
});
