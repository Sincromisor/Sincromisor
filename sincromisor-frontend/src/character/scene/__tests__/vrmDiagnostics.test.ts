import { expect, it, vi } from "vitest";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import { MotionDebugSceneRuntime } from "../../../pages/motionDebug/motionDebugSceneRuntime";
import { SincroLookingGlassVRMInitializer } from "../../lookingGlass/sincroLookingGlassVrmInitializer";
import { SincroVRM360Initializer } from "../../vrm360/sincroVrm360Initializer";
import { SincroVRMInitializer } from "../sincroVrmInitializer";
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
    vi.mocked(VRMScene).mockImplementation(() =>
        Object.assign(Object.create(VRMScene.prototype), {
            start,
            enableLookingGlassStartButton: vi.fn(),
            setSincroPoseRetargetConfig: vi.fn(),
        }),
    );
    for (const Initializer of [
        SincroVRMInitializer,
        SincroVRM360Initializer,
        SincroLookingGlassVRMInitializer,
    ]) {
        const initializer = Object.assign(Object.create(Initializer.prototype), {
            appController: {
                debug: { vrmDiagnostics: diagnostics },
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
    new MotionDebugSceneRuntime(params);
    const options = vi.mocked(VRMScene).mock.calls.at(-1)?.[0];
    options?.diagnostics?.onComposerResult?.({ ...result, warnings: [] });
    expect(resultSpy).toHaveBeenCalledOnce();
    resultSpy.mockRestore();
});
