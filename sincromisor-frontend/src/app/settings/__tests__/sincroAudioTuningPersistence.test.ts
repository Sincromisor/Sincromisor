import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("実音声コールバックでプリセットと手動調整を復元し、通常プリセットの再選択を優先する", async () => {
    const data = new Map<string, string>();
    const setItem = vi.fn((key: string, value: string) => {
        data.set(key, value);
    });
    // ページ再読込相当で共有モデルと音声処理を作り直し、保存領域だけを引き継ぐ。
    const boot = async () => {
        vi.resetModules();
        vi.stubGlobal(
            "Worker",
            class {
                postMessage() {}
                terminate() {}
            },
        );
        vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
        vi.stubGlobal(
            "window",
            Object.assign(new EventTarget(), {
                localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem },
            }),
        );
        vi.stubGlobal("document", { querySelector: () => ({}) });
        const { DialogManager } = await import("../../../features/dialog/model/dialogManager");
        const { DebugConsoleManager } = await import(
            "../../../features/debug/model/debugConsoleManager"
        );
        const { UserMediaManager } = await import(
            "../../../features/media/userMedia/userMediaManager"
        );
        const { ChatMessageService } = await import(
            "../../../features/conversation/chat/model/chatMessageService"
        );
        const { SincroAudioInputController } = await import(
            "../../controller/sincroAudioInputController"
        );
        const { SincroAppSettingsPersistence } = await import("../sincroAppSettingsPersistence");
        const mediaRead = vi.spyOn(UserMediaManager.prototype, "getAudioFilterConfig");
        const dialog = DialogManager.getManager();
        const debug = DebugConsoleManager.getManager();
        const audio = new SincroAudioInputController(
            dialog,
            debug,
            ChatMessageService.getService(),
        );
        const media = mediaRead.mock.contexts[0];
        if (!(media instanceof UserMediaManager)) throw new Error("音声処理が生成されていない");
        const persistence = new SincroAppSettingsPersistence("simple-vrm");
        dialog.updateSettings(persistence.load(), "restore");
        audio.restoreTuning(persistence);
        dialog.subscribeSettingsEdit((p) => persistence.save(p));
        return { dialog, debug, media, persistence };
    };
    let app = await boot();
    expect(setItem).not.toHaveBeenCalled();
    app.dialog.updateSettings({ enableVenueNoiseMode: true });
    app.debug.applyLocalAudioFilterConfig({
        highpassHz: 205,
        lowpassHz: 4300,
        lowpassEnabled: true,
    });
    app.debug.applyLocalLearnedVadPerformanceMode("high_accuracy");
    app.debug.applyLocalLearnedVadTuning({
        ...app.debug.getSnapshot().audio.learnedVadTuning,
        hangoverMs: 310,
    });
    app.debug.applyLocalLearnedVadStrictMode(true);
    expect(app.dialog.getSetting("enableVenueNoiseMode")).toBe(false);
    expect(app.persistence.getAudioTuning()).toMatchObject({
        vadRmsThreshold: 0.05,
        peakThreshold: 0.12,
    });
    const before = app.debug.getSnapshot().audio;
    setItem.mockClear();
    app = await boot();
    expect(setItem).not.toHaveBeenCalled();
    expect(app.debug.getSnapshot().audio).toMatchObject({
        filterConfig: before.filterConfig,
        learnedVadTuning: before.learnedVadTuning,
        learnedVadStrictMode: true,
        vadRmsThreshold: 0.05,
    });
    expect(app.media.getAudioFilterConfig()).toEqual(before.filterConfig);
    expect(app.media.getLearnedVadTuning()).toEqual(before.learnedVadTuning);
    expect(app.media.getLearnedVadTuning().onThreshold).toBe(0.00055);
    expect(app.media.getVadThresholds()).toMatchObject({
        rmsThreshold: 0.05,
        peakThreshold: 0.12,
    });
    app.debug.setLocalVadRmsThreshold(0.12);
    app.debug.updateLocalVadState(true);
    app.debug.updateLearnedVadState({ status: "ready", probability: 0.9 });
    expect(setItem).not.toHaveBeenCalled();
    app.dialog.updateSettings({ enableVenueNoiseMode: true });
    app = await boot();
    expect(app.dialog.getSetting("enableVenueNoiseMode")).toBe(true);
    expect(app.media.getAudioFilterConfig().highpassHz).toBe(180);
    expect(app.media.getLearnedVadTuning().hangoverMs).toBe(310);
    app.debug.applyLocalVadRmsThreshold(0.09);
    app = await boot();
    expect(app.dialog.getSetting("enableVenueNoiseMode")).toBe(false);
    expect(app.media.getAudioFilterConfig().highpassHz).toBe(180);
    expect(app.media.getVadThresholds()).toMatchObject({
        rmsThreshold: 0.09,
        peakThreshold: 0.12,
    });
    app.dialog.updateSettings({ enableVenueNoiseMode: true });
    app.dialog.updateSettings({ enableVenueNoiseMode: false });
    app = await boot();
    expect(app.media.getAudioFilterConfig().highpassHz).toBe(120);
    expect(app.media.getVadThresholds().rmsThreshold).toBe(0.015);
    app.debug.applyLocalVadThresholdMode("auto");
    app.dialog.updateSettings({ enableVenueNoiseMode: true });
    app.debug.applyLocalAudioFilterConfig({
        highpassHz: 215,
        lowpassHz: 4200,
        lowpassEnabled: true,
    });
    app = await boot();
    expect(app.media.getVadThresholdMode()).toBe("auto");
    app.debug.applyLocalVadThresholdMode("manual");
    expect(app.media.getVadThresholds()).toEqual({ rmsThreshold: 0.05, peakThreshold: 0.12 });
});

it("不正な音声項目だけを既定へ戻し、プリセットの精度と有効な項目を維持する", async () => {
    const { sincroAudioTuningSchema } = await import("../sincroAudioTuningSchema");
    expect(
        sincroAudioTuningSchema.parse({
            filterConfig: { highpassHz: Infinity, lowpassEnabled: true, lowpassHz: 4500 },
            vadThresholdMode: "invalid",
            vadRmsThreshold: -1,
            learnedVadTuning: { onThreshold: 0.00055, onConsecutiveFrames: 20 },
        }),
    ).toMatchObject({
        filterConfig: { highpassHz: 120, lowpassEnabled: true, lowpassHz: 4500 },
        vadThresholdMode: undefined,
        vadRmsThreshold: undefined,
        learnedVadTuning: { onThreshold: 0.00055, onConsecutiveFrames: 2 },
    });
});
