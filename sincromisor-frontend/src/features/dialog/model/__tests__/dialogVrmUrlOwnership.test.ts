import { VRMUtils } from "@pixiv/three-vrm";
import { Group, Scene } from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VRMCamera } from "../../../../character/scene/vrmCamera";
import { VRMCharacterManager } from "../../../../character/vrmCharacter/vrmCharacterManager";
import { frontendLogger } from "../../../../shared/logging/appLogger";
import { DialogEventHub } from "../dialogEventHub";
import { DialogNotificationService } from "../dialogNotificationService";
import { DialogStateStore } from "../dialogStateStore";
import { DialogVrmFileService } from "../dialogVrmFileService";
import { DialogVrmStateController } from "../dialogVrmStateController";

const { requests, loaderFailure } = vi.hoisted(() => ({
    requests: [] as Array<{
        url: string;
        success: (gltf: GLTF) => void;
        failure: (error: unknown) => void;
    }>,
    loaderFailure: { value: undefined as Error | undefined },
}));
vi.mock("three/examples/jsm/loaders/GLTFLoader.js", () => ({
    GLTFLoader: class {
        register() {}
        load(
            url: string,
            success: (gltf: GLTF) => void,
            _progress: unknown,
            failure: (error: unknown) => void,
        ) {
            if (loaderFailure.value) throw loaderFailure.value;
            requests.push({ url, success, failure });
        }
    },
}));
vi.mock("../../../../character/behavior/characterBehaviorState", () => ({
    CharacterBehaviorState: { getManager: () => ({}) },
}));

// URL寿命に無関係な骨制御だけを代替し、読込・attach・サムネイル通知の境界を通す。
vi.mock("../../../../character/vrmCharacter/vrmModelRuntime", () => ({
    createVrmModelRuntime: ({ vrm }: { vrm: unknown }) => ({
        vrm,
        sincroPoseRetargeter: { getAvatarMotionProfile: () => undefined },
    }),
}));

beforeEach(() => {
    requests.length = 0;
    loaderFailure.value = undefined;
    vi.stubGlobal("document", { querySelector: () => ({}) });
    let serial = 0;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:vrm-${++serial}`);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.spyOn(DialogVrmFileService.prototype, "loadVrmFileBlob").mockResolvedValue(undefined);
    vi.spyOn(DialogVrmFileService.prototype, "saveVrmFile").mockResolvedValue();
    vi.spyOn(DialogVrmFileService.prototype, "clearVrmThumbnailCache").mockResolvedValue();
    vi.spyOn(DialogNotificationService.prototype, "writeInfo").mockImplementation(() => {});
    vi.spyOn(DialogNotificationService.prototype, "writeError").mockImplementation(() => {});
    vi.spyOn(DialogNotificationService.prototype, "writePageError").mockImplementation(() => {});
    vi.spyOn(frontendLogger, "error").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "removeUnnecessaryVertices").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "combineSkeletons").mockImplementation(() => {});
    vi.spyOn(VRMUtils, "combineMorphs").mockImplementation(() => {});
});
afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

function setup() {
    const state = new DialogStateStore();
    const controller = new DialogVrmStateController(state, new DialogEventHub());
    return { state, controller };
}
async function select(controller: DialogVrmStateController, name: string) {
    controller.applySelectedVrmFile(new File([name], name));
    await controller.waitForSelection();
}
function load(controller: DialogVrmStateController, url: string, onThumbnailLoaded?: () => void) {
    return new VRMCharacterManager({
        scene: new Scene(),
        vrmCamera: {} as VRMCamera,
        vrmUrl: url,
        retainVrmUrl: (source) => controller.retainVrmUrl(source),
        onThumbnailLoaded,
    });
}
function loadedModel(): GLTF {
    const scene = new Group();
    return {
        scene,
        userData: {
            vrm: {
                scene,
                humanoid: { getNormalizedBoneNode: () => undefined },
                meta: { metaVersion: "1" },
            },
        },
    } as unknown as GLTF;
}

it("保存成功後だけ生成し、差し替え時に旧URLを解放し、保存失敗・不正形式では現在選択を保つ", async () => {
    const { state, controller } = setup();
    await controller.loadInitialVrmSelection();
    await select(controller, "A.vrm");
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await select(controller, "B.vrm");
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:vrm-1");
    vi.mocked(DialogVrmFileService.prototype.saveVrmFile).mockRejectedValue(
        new Error("save failed"),
    );
    await select(controller, "failed.vrm");
    await select(controller, "invalid.txt");
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(state.getSelectedVrmUrl()).toBe("blob:vrm-2");
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it("A読込中にBを選んでもAのURLを保ち、読込・attach成功後に一度だけ解放する", async () => {
    const { state, controller } = setup();
    await controller.loadInitialVrmSelection();
    await select(controller, "A.vrm");
    const manager = load(controller, state.getSelectedVrmUrl());
    await select(controller, "B.vrm");
    expect(requests[0]?.url).toBe("blob:vrm-1");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    requests[0]?.success(loadedModel());
    await manager.ready;
    expect(manager.vrm).toBeDefined();
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:vrm-1");
    expect(state.getSelectedVrmUrl()).toBe("blob:vrm-2");
    requests[0]?.failure(new Error("duplicate failure"));
    await manager.ready;
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it.each(["failure", "abort", "attach", "thumbnail", "sync"])(
    "%sの読込終端でも利用を終了する",
    async (outcome) => {
        const { state, controller } = setup();
        await controller.loadInitialVrmSelection();
        await select(controller, "A.vrm");
        if (outcome === "sync") {
            loaderFailure.value = new Error("loader start failed");
            await expect(load(controller, state.getSelectedVrmUrl()).ready).rejects.toThrow(
                "loader start failed",
            );
            await select(controller, "B.vrm");
        } else {
            const manager = load(
                controller,
                state.getSelectedVrmUrl(),
                outcome === "thumbnail"
                    ? () => {
                          throw new Error("thumbnail failed");
                      }
                    : undefined,
            );
            await select(controller, "B.vrm");
            expect(URL.revokeObjectURL).not.toHaveBeenCalled();

            if (outcome === "attach") requests[0]?.success({ userData: {} } as GLTF);
            else if (outcome === "thumbnail") requests[0]?.success(loadedModel());
            else
                requests[0]?.failure(
                    new DOMException(
                        "loading stopped",
                        outcome === "abort" ? "AbortError" : "NetworkError",
                    ),
                );
            await expect(manager.ready).rejects.toBeDefined();
        }
        expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:vrm-1");
        expect(state.getSelectedVrmUrl()).toBe("blob:vrm-2");
    },
);

it("同じURLの複数読込は全利用が終了するまで解放しない", async () => {
    const { state, controller } = setup();
    await controller.loadInitialVrmSelection();
    await select(controller, "A.vrm");
    const first = load(controller, state.getSelectedVrmUrl());
    const second = load(controller, state.getSelectedVrmUrl());
    await select(controller, "B.vrm");
    requests[0]?.success(loadedModel());
    await first.ready;
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    requests[1]?.failure(new Error("load failed"));
    await expect(second.ready).rejects.toThrow("load failed");
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:vrm-1");
});

it.each(["/characters/default.vrm", "https://example.test/model.vrm", "blob:external"])(
    "外部の%sは利用終了しても解放しない",
    async (url) => {
        const { controller } = setup();
        await controller.loadInitialVrmSelection();
        const manager = load(controller, url);
        await select(controller, "A.vrm");
        requests[0]?.success(loadedModel());
        await manager.ready;
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    },
);

it("復元の重複要求と復元・保存中の不採用選択からURLを生成しない", async () => {
    const { state, controller } = setup();
    let finishRestore!: (blob: Blob) => void;
    vi.mocked(DialogVrmFileService.prototype.loadVrmFileBlob).mockReturnValue(
        new Promise((resolve) => {
            finishRestore = resolve;
        }),
    );
    const first = controller.loadInitialVrmSelection();
    expect(controller.loadInitialVrmSelection()).toBe(first);
    controller.applySelectedVrmFile(new File(["ignored"], "ignored.vrm"));
    finishRestore(new Blob(["restored"]));
    await first;
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    let finishSave!: () => void;
    vi.mocked(DialogVrmFileService.prototype.saveVrmFile).mockReturnValue(
        new Promise<void>((resolve) => {
            finishSave = resolve;
        }),
    );
    controller.applySelectedVrmFile(new File(["A"], "A.vrm"));
    controller.applySelectedVrmFile(new File(["ignored"], "ignored.vrm"));
    await vi.waitFor(() =>
        expect(DialogVrmFileService.prototype.saveVrmFile).toHaveBeenCalledOnce(),
    );
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    finishSave();
    await controller.waitForSelection();
    await controller.loadInitialVrmSelection();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(2);
    expect(state.getSelectedVrmUrl()).toBe("blob:vrm-2");
    expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith("blob:vrm-1");
});

it("旧サムネイルの保存終端を待ってからキャッシュを消し、後着保存で旧画像を戻さない", async () => {
    vi.mocked(DialogVrmFileService.prototype.clearVrmThumbnailCache).mockRestore();
    let finishPut!: () => void;
    const writing = new Promise<void>((resolve) => {
        finishPut = resolve;
    });
    const cache = { put: vi.fn(() => writing), delete: vi.fn(async () => true) };
    vi.stubGlobal("caches", { open: async () => cache });
    const files = new DialogVrmFileService();
    const saved = files.saveVrmThumbnailBlob(new Blob(["old thumbnail"]));
    const cleared = files.clearVrmThumbnailCache();
    await vi.waitFor(() => expect(cache.put).toHaveBeenCalledOnce());
    expect(cache.delete).not.toHaveBeenCalled();
    finishPut();
    await saved;
    await cleared;
    expect(cache.delete).toHaveBeenCalledExactlyOnceWith("sincroVrmThumbnail");
});
