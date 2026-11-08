import { afterEach, beforeEach, expect, it, vi } from "vitest";

let SincroRTCConfigManager: typeof import("../sincroRtcConfigManager").SincroRTCConfigManager;
beforeEach(async () => {
    vi.resetModules();
    SincroRTCConfigManager = (await import("../sincroRtcConfigManager")).SincroRTCConfigManager;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("設定取得の非同期失敗を一度通知し、安全な診断入口へ渡す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("private-response")));
    const { frontendLogger } = await import("../../../shared/logging/appLogger");
    const diagnostic = vi.spyOn(frontendLogger, "diagnostic").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onerror = vi.fn();
    SincroRTCConfigManager.getManager(onerror);
    await vi.waitFor(() => expect(onerror).toHaveBeenCalledOnce());
    expect(diagnostic).toHaveBeenCalledExactlyOnceWith("signaling", "failed");
});

it("取得中の要求を共有し、失敗後に再取得して成功設定を保持する", async () => {
    const config = { offerURL: "/offer", candidateURL: "/candidate", iceServers: [] };
    const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValueOnce(new Response(JSON.stringify(config)));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onerror = vi.fn();
    const manager = SincroRTCConfigManager.getManager(onerror);
    const first = manager.getConfig();
    expect(manager.getConfig()).toBe(first);
    await expect(first).rejects.toThrow("unavailable");
    await expect(manager.getConfig()).resolves.toEqual(config);
    await expect(manager.getConfig()).resolves.toEqual(config);
    expect(fetchMock).toHaveBeenCalledTimes(2);
});
