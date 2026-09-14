import { expect, it, vi } from "vitest";
import { SincroLookingGlassVRMInitializer } from "../../../app/bootstrap/sincroLookingGlassVrmInitializer";
import { SincroVRM360Initializer } from "../../../app/bootstrap/sincroVrm360Initializer";
import { SincroVRMInitializer } from "../../../app/bootstrap/sincroVrmInitializer";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { MotionDebugSceneRuntime } from "../../../pages/motionDebug/motionDebugSceneRuntime";
import { VRMScene } from "../vrmScene";

vi.mock("../vrmScene", () => ({
    VRMScene: vi.fn(
        class {
            start() {}
            setSincroPoseRetargetConfig() {}
        },
    ),
}));
vi.mock("../../vrm360/vrm360Scene", async () => ({
    VRM360Scene: (await import("../vrmScene")).VRMScene,
}));
vi.mock("../../lookingGlass/lookingGlassVrmScene", async () => ({
    LookingGlassVRMScene: (await import("../vrmScene")).VRMScene,
}));

it("3ページの診断引数と独立ページの診断保存先を接続する", () => {
    const diagnostics = { onComposerResult: vi.fn() };
    const start = vi.fn();
    vi.mocked(VRMScene).mockImplementation(function () {
        Object.assign(this, {
            start,
            enableLookingGlassStartButton: vi.fn(),
            setSincroPoseRetargetConfig: vi.fn(),
        });
        return this;
    });
    for (const Initializer of [
        SincroVRMInitializer,
        SincroVRM360Initializer,
        SincroLookingGlassVRMInitializer,
    ]) {
        const initializer = Object.assign(Object.create(Initializer.prototype), {
            appController: {
                debug: { vrmDiagnostics: diagnostics },
                pose: { getConfig: () => ({}) },
                dialog: { getSelectedVrmUrl: () => "model.vrm" },
                state: { getSettingsSnapshot: () => ({}) },
            },
            syncSceneRuntimeSettings: vi.fn(),
        });
        initializer.initializeSincroScene();
        expect(VRMScene).toHaveBeenLastCalledWith(expect.objectContaining({ diagnostics }));
    }
    const debug = DebugConsoleManager.getManager();
    const result = { status: "missing_profile", warnings: [] } as const;
    const resultSpy = vi.spyOn(debug, "updateSincroComposerDryRunResult");
    // 描画資源を代替し、独立ページの本番組み立てだけを通す。
    const params: ConstructorParameters<typeof MotionDebugSceneRuntime>[0] = Object.create(null);
    params.initialRetargetConfig = debug.getSnapshot().sincroMotion.poseRetarget;
    new MotionDebugSceneRuntime(params);
    const options = vi.mocked(VRMScene).mock.calls.at(-1)?.[0];
    const logSpy = vi.spyOn(debug, "addTextChannelLog");
    options?.diagnostics?.onEmotionLog?.("[emotion] independent page\n");
    expect(logSpy).toHaveBeenCalledWith("[emotion] independent page\n");
    logSpy.mockRestore();
    options?.diagnostics?.onComposerResult?.({ ...result, warnings: [] });
    expect(resultSpy).toHaveBeenCalledOnce();
    resultSpy.mockRestore();
});
