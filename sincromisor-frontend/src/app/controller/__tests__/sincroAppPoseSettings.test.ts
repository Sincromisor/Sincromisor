import { afterEach, expect, it, vi } from "vitest";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { SincroAppController } from "../sincroAppController";

// 機器起動だけを代替し、実際のアプリ窓口・設定正規化・解除を通す。
vi.mock("../sincroController", () => ({
    SincroController: vi.fn(
        class {
            restoreAudioTuning() {}
            start() {}
        },
    ),
}));
afterEach(() => {
    SincroAppController.getCurrent()?.releaseEventSubscriptions();
    vi.unstubAllGlobals();
});

it("正規化済み設定を一度届け、アプリ差し替えと古い解除で新接続を消さない", () => {
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("document", { querySelector: () => ({}) });
    const debug = DebugConsoleManager.getManager();
    const old = new SincroAppController();
    const emotionLog = vi.spyOn(debug, "addTextChannelLog");
    old.debug.vrmDiagnostics.onEmotionLog?.("[emotion] connection test\n");
    expect(emotionLog).toHaveBeenCalledWith("[emotion] connection test\n");
    emotionLog.mockRestore();
    old.applySettings({ sincroPoseRetargetScale: 0.4 });
    const oldScene = vi.fn();
    const releaseOld = old.connectPoseSettings(oldScene);
    expect(oldScene).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ intensityScale: 0.4 }),
    );
    old.applySettings({ sincroPoseRetargetScale: 0.7 });
    expect(oldScene).toHaveBeenCalledTimes(2);
    expect(oldScene).toHaveBeenLastCalledWith(expect.objectContaining({ intensityScale: 0.7 }));
    debug.applySincroPoseRetargetConfig({ intensityScale: 999 });
    expect(oldScene).toHaveBeenCalledTimes(3);
    expect(oldScene).toHaveBeenLastCalledWith(old.pose.getConfig());
    expect(old.pose.getConfig().intensityScale).not.toBe(999);
    old.applySettings({ titleText: "無関係な設定" });
    expect(oldScene).toHaveBeenCalledTimes(3);
    const current = new SincroAppController();
    const scene = vi.fn();
    current.connectPoseSettings(scene);
    releaseOld();
    releaseOld();
    old.releaseEventSubscriptions();
    current.applySettings({ sincroPoseRetargetScale: 0.6 });
    expect(scene).toHaveBeenCalledTimes(2);
    expect(oldScene).toHaveBeenCalledTimes(3);
    current.releaseEventSubscriptions();
    current.releaseEventSubscriptions();
    debug.applySincroPoseRetargetConfig({ intensityScale: 0.2 });
    expect(scene).toHaveBeenCalledTimes(2);
});

it("保存した視線・姿勢調整を接続前から保持し、同値の通常強度操作で診断上書きを解除する", async () => {
    const values = new Map<string, string>();
    const write = vi.fn((key: string, value: string) => {
        values.set(key, value);
    });
    const boot = async () => {
        vi.resetModules();
        vi.stubGlobal(
            "window",
            Object.assign(new EventTarget(), {
                localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: write },
            }),
        );
        vi.stubGlobal("document", { querySelector: () => ({}) });
        vi.stubGlobal("caches", { open: async () => ({ match: async () => undefined }) });
        const { SincroAppController: Controller } = await import("../sincroAppController");
        const { DebugConsoleManager: Debug } = await import(
            "../../../features/debug/model/debugConsoleManager"
        );
        const { CharacterGaze } = await import(
            "../../../features/gaze/characterGaze/characterGaze"
        );
        const { CHARACTER_GAZE_TRACKING_TUNING_PRESETS: presets } = await import(
            "../../../features/debug/model/debugConsolePublicTypes"
        );
        const app = new Controller();
        app.dialog.updateCharacterAvailabilityStatus(true);
        app.restoreSettings("simple-vrm", {}, {});
        const debug = Debug.getManager();
        // 復元後に追跡コールバックを接続しても、保存値を初回に実処理へ渡す。
        const gaze = CharacterGaze.getManager();
        debug.setCharacterGazeTrackingTuningChangeCallback((config) =>
            gaze.setTrackingTuning(config),
        );
        return { app, debug, gaze, presets };
    };
    let active = await boot();
    active.app.applySettings({ sincroPoseRetargetScale: 0.4 });
    active.debug.applySincroPoseRetargetConfig({ smoothingMs: 175 });
    expect(JSON.parse(values.get("sincromisor:settings:simple-vrm") ?? "{}").pose).toEqual({
        smoothingMs: 175,
    });
    const angle = (34 * Math.PI) / 180;
    active.debug.applySincroPoseRetargetConfig({
        intensityScale: 0.9,
        armIkMaxLiftRad: angle,
        composerSemanticFingerApplicationMode: "off",
    });
    active.debug.applyCharacterGazeTrackingTuning({
        ...active.presets.stable,
        minimumHoldMs: 1250,
        oneEuroDCutoff: 1.25,
    });
    const savedGaze = active.gaze.getTrackingTuning();
    active.app.releaseEventSubscriptions();
    write.mockClear();
    active = await boot();
    expect(write).not.toHaveBeenCalled();
    expect(active.gaze.getTrackingTuning()).toEqual(savedGaze);
    const scene = vi.fn();
    active.app.connectPoseSettings(scene);
    expect(scene).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
            intensityScale: 0.9,
            smoothingMs: 175,
            armIkMaxLiftRad: angle,
            composerSemanticFingerApplicationMode: "off",
        }),
    );
    expect(active.app.getSettingsSnapshot().sincroPoseRetargetScale).toBe(0.4);
    active.debug.updateFaceXLog(0.5);
    active.debug.setSincroPoseRetargetConfig({ minConfidence: 0.5 });
    expect(write).not.toHaveBeenCalled();
    active.app.applySettings({ sincroPoseRetargetScale: 0.4 });
    expect(scene).toHaveBeenCalledTimes(2);
    expect(scene).toHaveBeenLastCalledWith(expect.objectContaining({ intensityScale: 0.4 }));
    expect(
        JSON.parse(values.get("sincromisor:settings:simple-vrm") ?? "{}").pose,
    ).not.toHaveProperty("intensityScale");
    active.app.releaseEventSubscriptions();
    active = await boot();
    const nextScene = vi.fn();
    active.app.connectPoseSettings(nextScene);
    expect(nextScene).toHaveBeenLastCalledWith(
        expect.objectContaining({ intensityScale: 0.4, armIkMaxLiftRad: angle }),
    );
    active.debug.applySincroPoseRetargetConfig({ intensityScale: 0.8 });
    active.app.applySettings({ sincroPoseRetargetScale: 0.6 });
    active.app.releaseEventSubscriptions();
    active = await boot();
    expect(active.app.pose.getConfig().intensityScale).toBe(0.6);
    expect(scene).toHaveBeenCalledTimes(2);
    active.app.releaseEventSubscriptions();
});
