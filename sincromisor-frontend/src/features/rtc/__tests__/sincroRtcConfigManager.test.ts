import { afterEach, expect, it, vi } from "vitest";
import { frontendLogger } from "../../../shared/logging/appLogger";
import { SincroRTCConfigManager } from "../sincroRtcConfigManager";

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("設定取得の非同期失敗を一度通知し、安全な診断入口へ渡す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-response")));
    const diagnostic = vi.spyOn(frontendLogger, "diagnostic").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onerror = vi.fn();
    SincroRTCConfigManager.getManager(onerror);
    await vi.waitFor(() => expect(onerror).toHaveBeenCalledOnce());
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith("signaling", "failed");
});
