import { afterEach, expect, it, vi } from "vitest";
import { VRMScene } from "../vrmScene";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it("通常・XR・単発描画の順序と予約、時刻の取得位置を維持する", () => {
    const calls: string[] = [];
    let nowMs = 100;
    vi.spyOn(performance, "now").mockImplementation(() => nowMs);
    const requestAnimationFrame = vi.fn();
    vi.stubGlobal("window", { requestAnimationFrame });
    let xrFrame: (() => void) | undefined;
    const characterUpdate = vi.fn((timestamp = performance.now()) => {
        calls.push(`character:${timestamp}`);
    });
    // WebGL資源を作らず、公開入口から本番のフレーム処理と予約処理を実行する。
    const scene: VRMScene = Object.create(VRMScene.prototype);
    Object.assign(scene, {
        xrMode: false,
        scene: {},
        vrmCamera: { camera: {} },
        vrmCharacterManager: { update: characterUpdate },
        updateScene: () => {
            calls.push("environment");
            nowMs += 1;
        },
        renderer: {
            xr: { isPresenting: false },
            render: () => calls.push("render"),
            setAnimationLoop: (callback: () => void) => {
                xrFrame = callback;
            },
        },
    });
    scene.start();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(calls.splice(0)).toEqual(["environment", "character:101", "render"]);
    Object.assign(scene, { xrMode: true });
    scene.start();
    expect(calls).toEqual([]);
    expect(xrFrame).toBeDefined();
    xrFrame?.();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
    expect(calls.splice(0)).toEqual(["environment", "character:102", "render"]);
    scene.renderOnce(42);
    expect(calls.splice(0)).toEqual(["environment", "character:42", "render"]);
    scene.renderOnce();
    expect(calls).toEqual(["environment", "character:103", "render"]);
    expect(characterUpdate).toHaveBeenCalledTimes(4);
});
