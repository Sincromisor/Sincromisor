import { expect, it, vi } from "vitest";
import type { TelopChannelMessage } from "../../../features/rtc/rtcMessage";
import { SincroRtcSessionController } from "../sincroRtcSessionController";

const clients = vi.hoisted(() => {
    const list: Array<{
        sessionResetCallback?: () => void;
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
                getConfig: vi.fn(),
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
        {
            getConfig: vi.fn(),
            config: { offerURL: "/offer", candidateURL: "/candidate", iceServers: [] },
        },
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
    clients[clients.length - 1]?.sessionResetCallback?.();
    clients[clients.length - 1]?.telopChannelCallback?.(message(1, 0));
    expect(addTelopChannelMessage).toHaveBeenCalledTimes(4);
    controller.stop();
});

it("設定取得中の開始を保留し、停止後には遅延接続を作らない", async () => {
    const config = { offerURL: "/offer", candidateURL: "/candidate", iceServers: [] };
    let resolveConfig = (_value: typeof config) => {};
    const getConfig = vi.fn(
        () =>
            new Promise<typeof config>((resolve) => {
                resolveConfig = resolve;
            }),
    );
    const controller = new SincroRtcSessionController(
        { setLocalAudioTrack: vi.fn() },
        { addTextChannelMessage: vi.fn(), addTelopChannelMessage: vi.fn() },
        { getConfig },
    );
    const track = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const before = clients.length;
    const starting = controller.start(track, "chat");
    expect(clients).toHaveLength(before);
    resolveConfig(config);
    await starting;
    expect(clients).toHaveLength(before + 1);
    controller.stop();
    const pending = controller.start(track, "chat");
    controller.stop();
    resolveConfig(config);
    await pending;
    expect(clients).toHaveLength(before + 1);
    expect(track.stop).toHaveBeenCalledOnce();
});

it("設定取得失敗後の明示開始で接続できる", async () => {
    const getConfig = vi
        .fn()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce({ offerURL: "/offer", candidateURL: "/candidate", iceServers: [] });
    const controller = new SincroRtcSessionController(
        { setLocalAudioTrack: vi.fn() },
        { addTextChannelMessage: vi.fn(), addTelopChannelMessage: vi.fn() },
        { getConfig },
    );
    const track = { kind: "audio", stop: vi.fn() } as unknown as MediaStreamTrack;
    const before = clients.length;
    await controller.start(track, "chat");
    expect(clients).toHaveLength(before);
    await controller.start(track, "chat");
    expect(clients).toHaveLength(before + 1);
    controller.stop();
});
