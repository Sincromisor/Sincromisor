import { expect, it, vi } from "vitest";
import { MotionDebugSceneRuntime } from "../../../pages/motionDebug/motionDebugSceneRuntime";
import { SincroPoseSettingsModel } from "../sincroPoseSettingsModel";

it("正規化・指定項目の返却・値の複製・登録ごとの解除をUIなしで行い、他のモデルへ影響しない", () => {
    const model = new SincroPoseSettingsModel();
    const other = new SincroPoseSettingsModel();
    const initial = other.getConfig();
    const listener = vi.fn();
    const old = model.subscribe(listener);
    const current = model.subscribe(listener);
    old();
    old();
    const edited = model.applyConfig({
        intensityScale: 99,
        minConfidence: Number.NaN,
        smoothingMs: 10,
        armIkMaxLiftRad: 99,
    });
    expect(edited).toEqual({
        intensityScale: 1.2,
        minConfidence: 0,
        smoothingMs: 40,
        armIkMaxLiftRad: Math.PI / 2,
    });
    expect(listener).toHaveBeenCalledOnce();
    const copy = model.getConfig();
    copy.intensityScale = -1;
    listener.mock.calls[0][0].intensityScale = -2;
    expect(model.getConfig().intensityScale).toBe(1.2);
    expect(other.getConfig()).toEqual(initial);
    current();
    model.applyConfig({ intensityScale: 0.4 });
    expect(listener).toHaveBeenCalledOnce();
});

const { sceneConfig } = vi.hoisted(() => ({ sceneConfig: vi.fn() }));
vi.mock("../../scene/vrmScene", () => ({
    VRMScene: class {
        start() {}
        setSincroPoseRetargetConfig(config: unknown) {
            sceneConfig(config);
        }
    },
}));

it("motion-debugの実際の描画接続でも同じ正規化済み設定を使い、別モデルへ持ち越さない", () => {
    const initial = new SincroPoseSettingsModel().getConfig();
    const runtime = new MotionDebugSceneRuntime({
        initialRetargetConfig: initial,
    } as unknown as ConstructorParameters<typeof MotionDebugSceneRuntime>[0]);
    const normal = new SincroPoseSettingsModel();
    const input = { smoothingMs: Number.POSITIVE_INFINITY, minConfidence: 9, armIkStrength: -2 };
    normal.applyConfig(input);
    expect(runtime.setSincroPoseRetargetConfig(input)).toEqual(normal.getConfig());
    expect(sceneConfig).toHaveBeenLastCalledWith(normal.getConfig());
    expect(new SincroPoseSettingsModel().getConfig()).toEqual(initial);
});
