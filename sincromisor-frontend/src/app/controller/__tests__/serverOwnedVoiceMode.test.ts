import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("保存済み診断方式は通常会話で実行せず、echo切替時だけ復元して停止・再接続後も抑止する", async () => {
    vi.resetModules();
    const data = new Map<string, string>();
    const workers: { terminate: ReturnType<typeof vi.fn> }[] = [];
    vi.stubGlobal(
        "Worker",
        class {
            terminate = vi.fn();
            postMessage() {}
            constructor() {
                workers.push(this);
            }
        },
    );
    vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
    vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), {
            localStorage: {
                getItem: (key: string) => data.get(key) ?? null,
                setItem: (key: string, value: string) => data.set(key, value),
            },
        }),
    );
    vi.stubGlobal("document", { querySelector: () => ({}) });
    const { SincroAppSettingsModel } = await import("../../settings/sincroAppSettingsModel");
    const { DebugConsoleManager } = await import(
        "../../../features/debug/model/debugConsoleManager"
    );
    const { UserMediaManager } = await import("../../../features/media/userMedia/userMediaManager");
    const { ChatMessageService } = await import(
        "../../../features/conversation/chat/model/chatMessageService"
    );
    const { SincroAudioInputController } = await import("../sincroAudioInputController");
    const { SincroAppSettingsPersistence } = await import(
        "../../settings/sincroAppSettingsPersistence"
    );
    const clientVad = vi.spyOn(UserMediaManager.prototype, "setClientVadEnabled");
    const gate = vi.spyOn(UserMediaManager.prototype, "setVadGateEnabled");
    const dialog = SincroAppSettingsModel.getShared();
    dialog.updateSettings({ talkMode: "chat", enableVadGate: true }, "restore");
    const debug = DebugConsoleManager.getManager();
    const audio = new SincroAudioInputController(dialog, debug, ChatMessageService.getService());
    const persistence = new SincroAppSettingsPersistence("simple-vrm");
    persistence.saveAudioTuning({ vadThresholdMode: "learned" });
    audio.restoreTuning(persistence);
    expect(clientVad).toHaveBeenLastCalledWith(false);
    expect(gate).toHaveBeenLastCalledWith(true);
    expect(debug.getSnapshot().audio.vadThresholdMode).toBe("learned");
    expect(workers).toHaveLength(0);
    dialog.updateSettings({ talkMode: "echo" });
    expect(clientVad).toHaveBeenLastCalledWith(true);
    expect(workers).toHaveLength(1);
    dialog.updateSettings({ talkMode: "sincro" });
    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(clientVad).toHaveBeenLastCalledWith(false);
    audio.stop();
    audio.restoreTuning(persistence);
    expect(workers).toHaveLength(1);
    expect(dialog.getSetting("enableVadGate")).toBe(true);
    expect(debug.getSnapshot().audio.clientVadEnabled).toBe(false);
});
