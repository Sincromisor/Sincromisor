import { afterEach, expect, it, vi } from "vitest";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { SincroAppController } from "../sincroAppController";

// 機器起動だけを代替し、実際のアプリ窓口・設定正規化・解除を通す。
vi.mock("../sincroController", () => ({
    SincroController: vi.fn(
        class {
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
