import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { coreStart, sceneOptions } = vi.hoisted(() => ({
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
    coreStart.mockClear();
    sceneOptions.mockClear();
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
    const { SincroAppController } = await import("../../controller");
    SincroAppController.getCurrent()?.releaseEventSubscriptions();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function setup(obs = false) {
    if (obs) Object.assign(window, { obsstudio: {} });
    const { frontendLogger } = await import("../../../shared/logging/appLogger");
    vi.spyOn(frontendLogger, "error").mockImplementation(() => {});
    vi.spyOn(frontendLogger, "warn").mockImplementation(() => {});
    const { DialogVrmWorkflowService } = await import(
        "../../../features/dialog/model/dialogVrmWorkflowService"
    );
    const restoring = deferred<{ vrmUrl?: string; statusText: string }>();
    vi.spyOn(DialogVrmWorkflowService.prototype, "loadInitialVrmSelection").mockReturnValue(
        restoring.promise,
    );
    const selection = vi.spyOn(DialogVrmWorkflowService.prototype, "applySelectedVrmFile");
    const { initializeSimpleVrmPage } = await import("../../../pages/simpleVrm/mainVrm");
    initializeSimpleVrmPage({
        canvasRoot: Object.create(null),
        characterControlLayer: Object.create(null),
    });
    const { SincroAppController } = await import("../../controller");
    const app = SincroAppController.getCurrent();
    if (!app) throw new Error("Expected initialized app");
    return { app, restoring, selection };
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
        restoring.resolve({ vrmUrl: "blob:restored", statusText: "前回選択したVRMモデルを使用中" });
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
        const { app, restoring } = await setup(true);
        if (outcome === "failure") restoring.reject(new Error("cache failure"));
        else restoring.resolve({ statusText: "既定のVRMモデルを使用中" });
        await vi.waitFor(() => expect(coreStart).toHaveBeenCalledOnce());
        expect(sceneOptions).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ vrmUrl: "/characters/default.vrm" }),
        );
        if (outcome === "failure")
            expect(app.getDialogVrmUiState().vrmStatusText).toContain("復元に失敗");
    },
);

it.each(["stop", "end", "release"])(
    "待機中の%s後に復元が完了しても開始しない",
    async (operation) => {
        const { app, restoring } = await setup(true);
        if (operation === "stop") app.stopRTC();
        else if (operation === "end") app.endExperience();
        else app.releaseEventSubscriptions();
        restoring.resolve({ vrmUrl: "blob:restored", statusText: "復元済み" });
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
    const saving = deferred<{ ok: true; vrmUrl: string; statusText: string; popMessage: string }>();
    selection.mockReturnValue(saving.promise);
    app.dialog.applySelectedVrmFile(new File(["vrm"], "new.vrm"));
    app.start();
    expect(coreStart).not.toHaveBeenCalled();
    expect(app.getDialogUiState().startButtonDisabled).toBe(true);
    saving.resolve({
        ok: true,
        vrmUrl: "blob:new",
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
    const saving = deferred<{ ok: true; vrmUrl: string; statusText: string; popMessage: string }>();
    selection.mockReturnValue(saving.promise);
    const { DialogManager } = await import("../../../features/dialog/model/dialogManager");
    const unsubscribe = DialogManager.getManager().subscribeVrmSelectionChange(() => app.start());
    app.dialog.applySelectedVrmFile(new File(["vrm"], "new.vrm"));
    expect(coreStart).not.toHaveBeenCalled();
    saving.resolve({ ok: true, vrmUrl: "blob:new", statusText: "選択中", popMessage: "更新済み" });
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
    restoring.resolve({ vrmUrl: "blob:restored", statusText: "復元済み" });
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
