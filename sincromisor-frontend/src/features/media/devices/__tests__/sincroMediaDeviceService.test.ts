import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
});

it("現在値の参照、取得中と成功・失敗の一覧、同時取得と監視・購読解除を保つ", async () => {
    const device: MediaDeviceInfo = {
        kind: "audioinput",
        deviceId: "mic",
        groupId: "group",
        label: "マイク",
        toJSON: () => ({}),
    };
    let resolveDevices: (devices: MediaDeviceInfo[]) => void = () => {};
    const enumerateDevices = vi.fn(
        () =>
            new Promise<MediaDeviceInfo[]>((resolve) => {
                resolveDevices = resolve;
            }),
    );
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    vi.stubGlobal("navigator", {
        mediaDevices: { enumerateDevices, addEventListener, removeEventListener },
    });
    const { SincroMediaDeviceService } = await import("../sincroMediaDeviceService");
    const service = SincroMediaDeviceService.getInstance();
    const initial = service.getSnapshot();
    expect(service.getSnapshot()).toBe(initial);
    const listener = vi.fn();
    const stop = service.subscribe(listener);
    expect(listener).toHaveBeenLastCalledWith(initial);
    service.start();
    service.start();
    expect(addEventListener).toHaveBeenCalledOnce();
    const first = service.refresh();
    const second = service.refresh();
    expect(enumerateDevices).toHaveBeenCalledOnce();
    const refreshing = service.getSnapshot();
    expect(refreshing.isRefreshing).toBe(true);
    expect(service.getSnapshot()).toBe(refreshing);
    resolveDevices([device]);
    const [success, shared] = await Promise.all([first, second]);
    expect(success).toBe(shared);
    expect(success).toBe(service.getSnapshot());
    expect(success.audioInputs[0].label).toBe("マイク");
    expect(initial.audioInputs).toEqual([]);
    expect(refreshing.isRefreshing).toBe(true);
    enumerateDevices.mockRejectedValueOnce(new Error("取得失敗"));
    const failure = await service.refresh();
    expect(failure.refreshError).toBe("取得失敗");
    expect(failure.isRefreshing).toBe(false);
    expect(failure.audioInputs).toBe(success.audioInputs);
    expect(success.refreshError).toBeUndefined();
    stop();
    listener.mockClear();
    enumerateDevices.mockResolvedValueOnce([]);
    await service.refresh();
    expect(listener).not.toHaveBeenCalled();
    expect(removeEventListener).not.toHaveBeenCalled();
    service.stop();
    expect(removeEventListener).toHaveBeenCalledOnce();
});

it("未対応環境では同じ空スナップショットを返す", async () => {
    vi.stubGlobal("navigator", {});
    const { SincroMediaDeviceService } = await import("../sincroMediaDeviceService");
    const service = SincroMediaDeviceService.getInstance();
    const snapshot = service.getSnapshot();
    expect(snapshot.isSupported).toBe(false);
    expect(await service.refresh()).toBe(snapshot);
});
