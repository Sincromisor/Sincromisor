import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SincroAppController } from "../../controller";
import { SincroVrmThumbnailController } from "../sincroVrmThumbnailController";

const app = {
    dialog: {
        loadVrmThumbnailBlob: vi.fn(async (): Promise<Blob | undefined> => undefined),
        saveVrmThumbnailBlob: vi.fn(async (_blob: Blob) => {}),
        clearVrmThumbnailCache: vi.fn(async () => {}),
    },
    chat: { setSystemIcon: vi.fn() },
};
let callbacks: BlobCallback[];
beforeEach(() => {
    callbacks = [];
    vi.clearAllMocks();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:owned-icon");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", {
        createElement: () => ({
            getContext: () => ({ drawImage() {} }),
            toBlob: (callback: BlobCallback) => callbacks.push(callback),
        }),
    });
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});
function controller() {
    return new SincroVrmThumbnailController(app as unknown as SincroAppController);
}
function image(extra = {}): HTMLImageElement {
    return {
        src: "blob:loader-owned",
        complete: true,
        naturalWidth: 1,
        naturalHeight: 1,
        ...extra,
    } as HTMLImageElement;
}

it("旧モデルのtoBlob後着と、選択変更前の変換結果を保存・表示しない", () => {
    const thumbs = controller();
    thumbs.update(image(), () => true);
    thumbs.update(undefined, () => true);
    callbacks[0]?.(new Blob(["old"]));
    expect(app.chat.setSystemIcon).toHaveBeenCalledExactlyOnceWith("/images/icon-system.webp");
    expect(app.dialog.saveVrmThumbnailBlob).not.toHaveBeenCalled();
    thumbs.update(image(), () => true);
    thumbs.invalidate();
    callbacks[1]?.(new Blob(["obsolete"]));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("旧画像のdecode後着と旧キャッシュ復元を新モデルへ適用しない", async () => {
    const thumbs = controller();
    let decoded!: () => void;
    const decode = new Promise<void>((resolve) => {
        decoded = resolve;
    });
    thumbs.update(image({ complete: false, decode: () => decode }), () => true);
    let restored!: (blob: Blob) => void;
    app.dialog.loadVrmThumbnailBlob.mockReturnValueOnce(
        new Promise((resolve) => {
            restored = resolve;
        }),
    );
    thumbs.restoreCached();
    thumbs.update(undefined, () => true);
    decoded();
    restored(new Blob(["old"]));
    await Promise.resolve();
    await Promise.resolve();
    expect(callbacks).toHaveLength(0);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("自前URLだけを解放し、ローダー由来のBlob URLを所有しない", () => {
    const thumbs = controller();
    thumbs.update(image(), () => true);
    callbacks[0]?.(new Blob(["current"]));
    expect(app.chat.setSystemIcon).toHaveBeenLastCalledWith("blob:owned-icon");
    thumbs.update(image(), () => true);
    callbacks[1]?.(null);
    expect(app.chat.setSystemIcon).toHaveBeenLastCalledWith("blob:loader-owned");
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:owned-icon");
    thumbs.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it("解除後のtoBlob結果はURLを生成せず、モデル世代が無効なら反映しない", () => {
    const thumbs = controller();
    let current = true;
    thumbs.update(image(), () => current);
    current = false;
    callbacks[0]?.(new Blob(["obsolete"]));
    thumbs.update(image(), () => true);
    thumbs.release();
    callbacks[1]?.(new Blob(["released"]));
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(app.dialog.saveVrmThumbnailBlob).not.toHaveBeenCalled();
});
