import { afterEach, beforeEach, expect, it, vi } from "vitest";

const restoredBlob = new Blob(["restored"]);
const selectedBlob = new Blob(["new"]);

const { coreStart, sceneOptions, sceneReplace, sceneReadiness } = vi.hoisted(() => ({
    sceneReplace: vi.fn(async (_url: string, _signal?: AbortSignal) => {}),
    sceneReadiness: { promise: undefined as Promise<void> | undefined },
    coreStart: vi.fn(),
    sceneOptions: vi.fn(),
}));
vi.mock("../../controller/sincroController", () => ({
    SincroController: class {
        restoreAudioTuning() {}
        releaseTrackingSubscriptions() {}
        stopRTC() {}
        endExperience() {}
        start() {
            coreStart();
        }
    },
}));
vi.mock("../../../character/scene/vrmScene", () => ({
    VRMScene: class {
        get ready() {
            return sceneReadiness.promise ?? Promise.resolve();
        }
        replaceVrm(url: string, signal?: AbortSignal) {
            return sceneReplace(url, signal);
        }
        constructor(options: unknown) {
            sceneOptions(options);
        }
        start() {}
        setSincroPoseRetargetConfig() {}
        setCharacterVisible() {}
        setCharacterMotionTuning() {}
    },
}));

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<T>((done, fail) => {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}

beforeEach(() => {
    vi.resetModules();
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) =>
        blob === restoredBlob ? "blob:restored" : "blob:new",
    );
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    coreStart.mockClear();
    sceneOptions.mockClear();
    sceneReplace.mockReset().mockResolvedValue();
    sceneReadiness.promise = undefined;
    vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), {
            location: { search: "" },
            localStorage: { getItem: () => null, setItem: vi.fn() },
        }),
    );
    vi.stubGlobal("document", { querySelector: () => ({}) });
    vi.stubGlobal("navigator", {
        mediaDevices: {
            getUserMedia: vi.fn(),
            enumerateDevices: async () => [],
            addEventListener() {},
        },
    });
});
afterEach(async () => {
    const { getActiveSincroAppController } = await import(
        "../../controller/activeSincroAppController"
    );
    getActiveSincroAppController()?.releaseEventSubscriptions();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function setup(obs = false) {
    if (obs) Object.assign(window, { obsstudio: {} });
    const { frontendLogger } = await import("../../../shared/logging/appLogger");
    vi.spyOn(frontendLogger, "error").mockImplementation(() => {});
    vi.spyOn(frontendLogger, "warn").mockImplementation(() => {});
    const { DialogNotificationService } = await import(
        "../../../features/dialog/model/dialogNotificationService"
    );
    const recoveryNotice = vi
        .spyOn(DialogNotificationService.prototype, "writePageError")
        .mockImplementation(() => {});
    const { DialogVrmWorkflowService } = await import(
        "../../../features/dialog/model/dialogVrmWorkflowService"
    );
    const restoring = deferred<{ vrmBlob?: Blob; statusText: string }>();
    vi.spyOn(DialogVrmWorkflowService.prototype, "loadInitialVrmSelection").mockReturnValue(
        restoring.promise,
    );
    const selection = vi.spyOn(DialogVrmWorkflowService.prototype, "applySelectedVrmFile");
    const { initializeSimpleVrmPage } = await import("../../../pages/simpleVrm/mainVrm");
    initializeSimpleVrmPage({
        canvasRoot: Object.create(null),
        characterControlLayer: Object.create(null),
    });
    const { getActiveSincroAppController } = await import(
        "../../controller/activeSincroAppController"
    );
    const app = getActiveSincroAppController();
    if (!app) throw new Error("Expected initialized app");
    return { app, restoring, selection, recoveryNotice };
}

it.each([false, true])(
    "手動・OBS開始は復元を待ち、選択済みURLを一度だけ初回シーンへ渡す（OBS=%s）",
    async (obs) => {
        const { app, restoring, selection } = await setup(obs);
        app.start();
        app.start();
        expect(app.getDialogUiState()).toMatchObject({
            startButtonDisabled: true,
            startButtonText: "開始準備中…",
        });
        app.dialog.applySelectedVrmFile(new File(["vrm"], "ignored.vrm"));
        expect(selection).not.toHaveBeenCalled();
        expect(coreStart).not.toHaveBeenCalled();
        expect(sceneOptions).not.toHaveBeenCalled();
        expect(app.calibration.getState()).toEqual({ status: "idle" });
        restoring.resolve({ vrmBlob: restoredBlob, statusText: "前回選択したVRMモデルを使用中" });
        await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
        expect(sceneOptions).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ vrmUrl: "blob:restored" }),
        );
        expect(app.getDialogVrmUiState().isSelectionPending).toBe(false);
    },
);

it.each(["none", "failure"])(
    "保存なし・復元失敗は既定モデルで開始できる（%s）",
    async (outcome) => {
        const { app, restoring, recoveryNotice } = await setup(true);
        if (outcome === "failure") restoring.reject(new Error("cache failure"));
        else restoring.resolve({ statusText: "既定のVRMモデルを使用中" });
        await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
        expect(sceneOptions).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ vrmUrl: "/characters/default.vrm" }),
        );
        if (outcome === "failure") {
            expect(app.getDialogVrmUiState().vrmStatusText).toContain("復元に失敗");
            expect(recoveryNotice).toHaveBeenCalledExactlyOnceWith(
                "VRMの復元に失敗しました。既定のモデルで開始できます",
            );
        } else {
            expect(recoveryNotice).not.toHaveBeenCalled();
        }
    },
);

it.each(["stop", "end", "release"])(
    "待機中の%s後に復元が完了しても開始しない",
    async (operation) => {
        const { app, restoring } = await setup(true);
        if (operation === "stop") app.stopRTC();
        else if (operation === "end") app.endExperience();
        else app.releaseEventSubscriptions();
        restoring.resolve({ vrmBlob: restoredBlob, statusText: "復元済み" });
        await app.dialog.waitForVrmSelection();
        await Promise.resolve();
        expect(coreStart).not.toHaveBeenCalled();
        expect(sceneOptions).not.toHaveBeenCalled();
        expect(app.dialog.getSelectedVrmUrl()).toBe("blob:restored");
        expect(app.calibration.getState()).toEqual({ status: "idle" });
    },
);

it("復元後の選択保存も確定まで開始せず、保存したモデルを使う", async () => {
    const { app, restoring, selection } = await setup();
    restoring.resolve({ statusText: "既定のVRMモデルを使用中" });
    await app.dialog.waitForVrmSelection();
    const saving = deferred<{ ok: true; vrmBlob: Blob; statusText: string; popMessage: string }>();
    selection.mockReturnValue(saving.promise);
    app.dialog.applySelectedVrmFile(new File(["vrm"], "new.vrm"));
    app.start();
    expect(coreStart).not.toHaveBeenCalled();
    expect(app.getDialogUiState().startButtonDisabled).toBe(true);
    saving.resolve({
        ok: true,
        vrmBlob: selectedBlob,
        statusText: "選択中: new.vrm",
        popMessage: "更新済み",
    });
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
    expect(sceneOptions).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ vrmUrl: "blob:new" }),
    );
});

it("保存開始の同期購読からの開始も保存を待つ", async () => {
    const { app, restoring, selection } = await setup();
    restoring.resolve({ statusText: "既定のVRMモデルを使用中" });
    await app.dialog.waitForVrmSelection();
    const saving = deferred<{ ok: true; vrmBlob: Blob; statusText: string; popMessage: string }>();
    selection.mockReturnValue(saving.promise);
    const { DialogManager } = await import("../../../features/dialog/model/dialogManager");
    const unsubscribe = DialogManager.getManager().subscribeVrmSelectionChange(() => app.start());
    app.dialog.applySelectedVrmFile(new File(["vrm"], "new.vrm"));
    expect(coreStart).not.toHaveBeenCalled();
    saving.resolve({
        ok: true,
        vrmBlob: selectedBlob,
        statusText: "選択中",
        popMessage: "更新済み",
    });
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
    expect(sceneOptions).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ vrmUrl: "blob:new" }),
    );
    unsubscribe();
});

it("開始準備の同期通知で終了した場合も開始しない", async () => {
    const { app, restoring } = await setup();
    const unsubscribe = app.subscribe((event) => {
        if (event.type === "lifecycle" && event.state === "starting") app.endExperience();
    });
    app.start();
    restoring.resolve({ vrmBlob: restoredBlob, statusText: "復元済み" });
    await app.dialog.waitForVrmSelection();
    await Promise.resolve();
    expect(coreStart).not.toHaveBeenCalled();
    unsubscribe();
});

it("開始準備の同期例外は停止状態へ戻り、再試行できる", async () => {
    const { app } = await setup();
    app.setStartHooks({
        prepareStart: () => {
            throw new Error("prepare failed");
        },
    });
    expect(() => app.start()).toThrow("prepare failed");
    const states: string[] = [];
    const unsubscribe = app.subscribe((event) => {
        if (event.type === "lifecycle") states.push(event.state);
    });
    expect(states).toEqual(["stopped"]);
    app.setStartHooks({});
    app.start();
    expect(coreStart).toHaveBeenCalledOnce();
    unsubscribe();
});

async function startRestored() {
    const state = await setup();
    state.restoring.resolve({ vrmBlob: restoredBlob, statusText: "復元済み" });
    state.app.start();
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
    return state;
}
async function chooseReplacement(state: Awaited<ReturnType<typeof setup>>) {
    state.selection.mockResolvedValue({
        ok: true,
        vrmBlob: selectedBlob,
        statusText: "選択中: B.vrm",
        popMessage: "更新済み",
    });
    state.app.dialog.applySelectedVrmFile(new File(["B"], "B.vrm"));
    await state.app.dialog.waitForVrmSelection();
}

it("同じモデルでの再開始はシーンを増やさず、毎回ダイアログを閉じる", async () => {
    const { app } = await startRestored();
    expect(app.getDialogUiState().isOpen).toBe(false);
    app.stopRTC();
    app.dialog.open();
    app.start();
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledTimes(2));
    expect(sceneOptions).toHaveBeenCalledOnce();
    expect(app.getDialogUiState().isOpen).toBe(false);
});

it("別モデルの交換成功を待ち、失敗時はダイアログを保持して同じ選択を再試行する", async () => {
    const state = await startRestored();
    const { app } = state;
    app.stopRTC();
    app.dialog.open();
    await chooseReplacement(state);
    const replacing = deferred<void>();
    sceneReplace.mockReturnValueOnce(replacing.promise);
    app.start();
    await vi.waitFor(() => expect(sceneReplace).toHaveBeenCalledOnce());
    expect(app.getDialogUiState().isOpen).toBe(true);
    expect(coreStart).toHaveBeenCalledOnce();
    replacing.reject(new Error("replacement failed"));
    await vi.waitFor(() =>
        expect(app.getDialogVrmUiState().modelStatusText).toContain("前のモデル"),
    );
    expect(app.getDialogUiState().isOpen).toBe(true);
    app.start();
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledTimes(2));
    expect(app.getDialogUiState().isOpen).toBe(false);
    expect(app.getDialogVrmUiState().modelStatusText).toBe("選択したモデルを表示中");
    expect(sceneOptions).toHaveBeenCalledOnce();
    expect(sceneReplace).toHaveBeenLastCalledWith("blob:new", expect.any(AbortSignal));
});

it("初回Character無効から有効にした再開始で初めてシーンを生成する", async () => {
    const { app, restoring } = await setup();
    app.applySettings({ enableCharacter: false });
    restoring.resolve({ statusText: "既定モデル" });
    app.start();
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
    expect(sceneOptions).not.toHaveBeenCalled();
    app.stopRTC();
    app.dialog.open();
    app.applySettings({ enableCharacter: true });
    app.start();
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledTimes(2));
    expect(sceneOptions).toHaveBeenCalledOnce();
    expect(app.getDialogUiState().isOpen).toBe(false);
});

it.each(["stop", "end", "release"])(
    "モデル読込中の%s後はダイアログと機器を開始しない",
    async (operation) => {
        const { app, restoring } = await setup();
        const loading = deferred<void>();
        sceneReadiness.promise = loading.promise;
        restoring.resolve({ statusText: "既定モデル" });
        app.start();
        await vi.waitFor(() => expect(sceneOptions).toHaveBeenCalledOnce());
        const signal = sceneOptions.mock.calls[0]?.[0].loadSignal as AbortSignal;
        if (operation === "stop") app.stopRTC();
        else if (operation === "end") app.endExperience();
        else app.releaseEventSubscriptions();
        expect(signal.aborted).toBe(true);
        loading.resolve();
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(coreStart).not.toHaveBeenCalled();
        expect(app.getDialogUiState().isOpen).toBe(true);
    },
);

it("モデル読込中の選択変更は旧開始を取り消し、新しい開始だけを完了させる", async () => {
    const state = await startRestored();
    const { app } = state;
    app.stopRTC();
    app.dialog.open();
    await chooseReplacement(state);
    const old = deferred<void>();
    sceneReplace.mockReturnValueOnce(old.promise);
    app.start();
    await vi.waitFor(() => expect(sceneReplace).toHaveBeenCalledOnce());
    const oldSignal = sceneReplace.mock.calls[0]?.[1];
    await chooseReplacement(state);
    expect(oldSignal?.aborted).toBe(true);
    app.start();
    await vi.waitFor(() => expect(coreStart).toHaveBeenCalledTimes(2));
    old.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(coreStart).toHaveBeenCalledTimes(2);
    expect(app.getDialogUiState().isOpen).toBe(false);
});

it("準備フック内の同期取消し後のPromise失敗も終端購読して未処理拒否にしない", async () => {
    const { app } = await setup();
    app.setStartHooks({
        prepareStart: () => {
            app.endExperience();
            return Promise.reject(new Error("cancelled preparation"));
        },
    });
    app.start();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(coreStart).not.toHaveBeenCalled();
});

it("読込中の同期状態通知で終了した場合はシーンも生成しない", async () => {
    const { app, restoring } = await setup();
    const unsubscribe = app.subscribe((event) => {
        if (
            event.type === "dialog_vrm_ui_state" &&
            event.uiState.modelStatusText === "選択したモデルを読み込んでいます"
        )
            app.endExperience();
    });
    restoring.resolve({ statusText: "既定モデル" });
    app.start();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(sceneOptions).not.toHaveBeenCalled();
    expect(coreStart).not.toHaveBeenCalled();
    unsubscribe();
});
