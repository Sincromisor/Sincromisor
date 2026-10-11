import { expect, it, vi } from "vitest";
import type { TalkManager } from "../../../features/conversation/talk/talkManager";
import type { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import type { SincroRTCConfigManager } from "../../../features/rtc/sincroRtcConfigManager";
import { SincroRtcSessionController } from "../sincroRtcSessionController";

const clients = vi.hoisted(
    () => [] as Array<{ setMute: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }>,
);
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

it("echoは自動ミュートを無視し、手動操作を維持して通常モードへ復帰する", () => {
    const controller = new SincroRtcSessionController(
        { setLocalAudioTrack: vi.fn() } as unknown as DebugConsoleManager,
        {} as TalkManager,
        {
            config: { offerURL: "/offer", candidateURL: "/candidate", iceServers: [] },
        } as unknown as SincroRTCConfigManager,
    );
    controller.start({} as MediaStreamTrack, "echo");
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
    controller.start({} as MediaStreamTrack, "chat");
    const chat = clients[clients.length - 1];
    controller.setAutoMute(true);
    expect(chat.setMute).toHaveBeenLastCalledWith(true);
    controller.setManualMute(true);
    controller.setAutoMute(false);
    expect(chat.setMute).toHaveBeenLastCalledWith(true);
    controller.setManualMute(false);
    expect(chat.setMute).toHaveBeenLastCalledWith(false);
    controller.stop();
});
