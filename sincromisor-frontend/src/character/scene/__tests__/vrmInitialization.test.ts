import { afterEach, expect, it, vi } from "vitest";

const { coreStart, sceneStart } = vi.hoisted(() => ({ coreStart: vi.fn(), sceneStart: vi.fn() }));
vi.mock("../../../app/controller/sincroController", () => ({
    SincroController: class {
        restoreAudioTuning() {}
        start() {
            coreStart();
        }
    },
}));
vi.mock("../vrmScene", () => ({
    VRMScene: class {
        start() {
            sceneStart();
        }
        enableLookingGlassStartButton() {}
        setSincroPoseRetargetConfig() {}
        setCharacterVisible() {}
        setCharacterMotionTuning() {}
    },
}));
vi.mock("../../vrm360/vrm360Scene", async () => ({
    VRM360Scene: (await import("../vrmScene")).VRMScene,
}));
vi.mock("../../lookingGlass/lookingGlassVrmScene", async () => ({
    LookingGlassVRMScene: (await import("../vrmScene")).VRMScene,
}));

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

it("実際の3ページ入口で設定確定後に手動・OBS開始し、再開始を抑止する", async () => {
    for (const obs of [false, true]) {
        for (const page of [
            "simple",
            "simple-chat",
            "simple-invalid",
            "360",
            "lookingGlass",
        ] as const) {
            vi.resetModules();
            const win = Object.assign(new EventTarget(), {
                localStorage: {
                    getItem: () =>
                        JSON.stringify({
                            version: 1,
                            settings: {
                                titleText: "復元済み",
                                characterMotionScale: 0.72,
                                sincroPoseRetargetScale: 0.68,
                                talkMode: "sincro",
                            },
                        }),
                    setItem: vi.fn(() => {
                        throw new Error("初期化中は保存しない");
                    }),
                },
                location: {
                    search: `?talkMode=${page === "simple-chat" ? "chat" : page === "simple-invalid" ? "invalid" : "sincro"}`,
                },
                ...(obs ? { obsstudio: {} } : {}),
            });
            vi.stubGlobal("window", win);
            vi.stubGlobal("document", { querySelector: () => ({}) });
            vi.stubGlobal("navigator", {
                mediaDevices: {
                    getUserMedia: vi.fn(),
                    enumerateDevices: async () => [],
                    addEventListener() {},
                },
            });
            coreStart.mockClear();
            sceneStart.mockClear();
            const { frontendLogger } = await import("../../../shared/logging/appLogger");
            vi.spyOn(frontendLogger, "debug").mockImplementation(() => {});
            vi.spyOn(frontendLogger, "error").mockImplementation(() => {});
            const cachedWarning = vi.spyOn(frontendLogger, "warn").mockImplementation(() => {});
            const { SincroAppController } = await import("../../../app/controller");
            const { ChatMessageService } = await import(
                "../../../features/conversation/chat/model/chatMessageService"
            );
            const greeting = vi.spyOn(ChatMessageService.getService(), "writeSystemMessage");
            coreStart.mockImplementation(() => {
                const app = SincroAppController.getCurrent();
                expect(app?.getSettingsSnapshot()).toMatchObject({
                    titleText: "復元済み",
                    characterMotionScale: 0.72,
                    sincroPoseRetargetScale: 0.68,
                    enableCharacter: true,
                    enableCharacterGaze: page !== "360",
                    enableAutoMute: false,
                    ...(page.startsWith("simple")
                        ? { talkMode: page === "simple-chat" ? "chat" : "sincro" }
                        : {}),
                });
                app?.start();
            });
            const roots = {
                canvasRoot: Object.create(null),
                characterControlLayer: Object.create(null),
            };
            if (page.startsWith("simple"))
                (await import("../../../pages/simpleVrm/mainVrm")).initializeSimpleVrmPage(roots);
            else if (page === "360")
                (await import("../../../pages/vrm360/mainVrm360")).initializeVrm360Page(roots);
            else
                (
                    await import("../../../pages/lookingGlassVrm/mainVrmLookingGlass")
                ).initializeLookingGlassVrmPage(roots);
            await vi.waitFor(() => expect(SincroAppController.getCurrent()).toBeDefined());
            const app = SincroAppController.getCurrent();
            expect(coreStart).toHaveBeenCalledTimes(obs ? 1 : 0);
            app?.start();
            app?.start();
            expect(coreStart).toHaveBeenCalledOnce();
            expect(win.localStorage.setItem).not.toHaveBeenCalled();
            expect(sceneStart).toHaveBeenCalledOnce();
            expect(greeting).toHaveBeenCalledTimes(2);
            await vi.waitFor(() =>
                expect(cachedWarning).toHaveBeenCalledWith(
                    "Failed to load cached VRM thumbnail.",
                    expect.anything(),
                ),
            );
            app?.releaseEventSubscriptions();
            greeting.mockRestore();
        }
    }
});

it("初期化失敗を入口へ報告し、OBSも手動も部分的に開始しない", async () => {
    vi.resetModules();
    coreStart.mockClear();
    sceneStart.mockClear();
    vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), { obsstudio: {}, location: { search: "" } }),
    );
    vi.stubGlobal("document", { querySelector: () => ({}) });
    vi.stubGlobal("navigator", {
        mediaDevices: {
            getUserMedia: vi.fn(),
            enumerateDevices: async () => [],
            addEventListener() {},
        },
    });
    const { DialogManager } = await import("../../../features/dialog/model/dialogManager");
    const { SincroAppController } = await import("../../../app/controller");
    vi.spyOn(DialogManager.prototype, "updateCharacterStatus").mockImplementation(() => {
        throw new Error("initialization failed");
    });
    const { initializeSimpleVrmPage } = await import("../../../pages/simpleVrm/mainVrm");
    expect(() =>
        initializeSimpleVrmPage({
            canvasRoot: Object.create(null),
            characterControlLayer: Object.create(null),
        }),
    ).toThrow("initialization failed");
    expect(() => SincroAppController.getCurrent()?.start()).toThrow("VRM page is not initialized.");
    expect(coreStart).not.toHaveBeenCalled();
    expect(sceneStart).not.toHaveBeenCalled();
    SincroAppController.getCurrent()?.releaseEventSubscriptions();
});
