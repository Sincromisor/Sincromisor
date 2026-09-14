import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("取消・書込み中・全ページ削除・失敗再実行を通して所有データだけを初期化する", async () => {
    vi.resetModules();
    const { resetSincroAppSettings, buildResetSettingsUrl } = await import(
        "../sincroAppSettingsReset"
    );
    const { SincroAppSettingsPersistence, sincroSettingsPages, sincroSettingsStorageKey } =
        await import("../sincroAppSettingsPersistence");
    const { DialogVrmFileService } = await import(
        "../../../features/dialog/model/dialogVrmFileService"
    );
    const href = "https://example.test/simple-vrm/?talkMode=sincro&keep=1#here";
    expect(buildResetSettingsUrl(href)).toBe("https://example.test/simple-vrm/?keep=1#here");
    const data = new Map<string, string>([["unrelated", "keep"]]);
    for (const page of sincroSettingsPages) data.set(sincroSettingsStorageKey(page), "broken-json");
    data.set(
        sincroSettingsStorageKey("vrm360"),
        JSON.stringify({
            version: 1,
            settings: {},
            audio: { vadRmsThreshold: 0.05 },
            gaze: { minimumHoldMs: 1250 },
            pose: { intensityScale: 0.9 },
        }),
    );
    const cacheData = new Map<string, Response>();
    for (const path of [
        "/simple-vrm/sincroVrmFile",
        "/vrm360/sincroVrmThumbnail",
        "/sincroVrmFile",
        "/other/sincroVrmFile",
        "/unrelated",
    ])
        cacheData.set(`https://example.test${path}`, new Response("data"));
    const waiting = deferred();
    const putStarted = deferred();
    const cache = {
        put: vi.fn(async (key: string, value: Response) => {
            putStarted.resolve();
            await waiting.promise;
            cacheData.set(new URL(key, href).href, value);
        }),
        keys: async () => [...cacheData.keys()].map((url) => new Request(url)),
        delete: vi.fn(async (request: Request) => cacheData.delete(request.url)),
    };
    const open = vi.fn(async () => cache);
    vi.stubGlobal("caches", { open });
    const localStorage = {
        getItem: (key: string) => data.get(key) ?? null,
        setItem: vi.fn((key: string, value: string) => {
            data.set(key, value);
        }),
        removeItem: vi.fn((key: string) => {
            data.delete(key);
        }),
    };
    const confirm = vi.fn(() => false);
    const reload = vi.fn();
    const replaceState = vi.fn();
    vi.stubGlobal("window", {
        confirm,
        localStorage,
        location: { href, origin: "https://example.test", reload },
        history: { state: null, replaceState },
    });
    await resetSincroAppSettings();
    expect(open).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();

    const files = new DialogVrmFileService();
    const writing = files.saveVrmThumbnailBlob(new Blob(["thumbnail"]));
    await putStarted.promise;
    confirm.mockReturnValue(true);
    const resetting = resetSincroAppSettings();
    await files.saveVrmFile(new File(["late"], "late.vrm"));
    new SincroAppSettingsPersistence("simple-vrm").save({ titleText: "late" });
    expect(cache.put).toHaveBeenCalledOnce();
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    waiting.resolve();
    await writing;
    await resetting;
    expect([...data]).toEqual([["unrelated", "keep"]]);
    expect([...cacheData.keys()]).toEqual([
        "https://example.test/other/sincroVrmFile",
        "https://example.test/unrelated",
    ]);
    expect(replaceState).toHaveBeenCalledWith(
        null,
        "",
        "https://example.test/simple-vrm/?keep=1#here",
    );
    expect(reload).toHaveBeenCalledOnce();
    await files.saveVrmThumbnailBlob(new Blob(["late conversion"]));
    expect(cache.put).toHaveBeenCalledOnce();

    open.mockRejectedValueOnce(new Error("cache denied"));
    await expect(resetSincroAppSettings()).rejects.toThrow("cache denied");
    localStorage.removeItem.mockImplementationOnce(() => {
        throw new Error("storage denied");
    });
    await expect(resetSincroAppSettings()).rejects.toThrow("storage denied");
    expect(reload).toHaveBeenCalledOnce();
    await resetSincroAppSettings();
    expect(reload).toHaveBeenCalledTimes(2);
});

function deferred() {
    let resolve = () => {};
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
