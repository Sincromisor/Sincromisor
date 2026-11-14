import { expect, it, vi } from "vitest";

// 読み取り窓口の読み込みでサービスを組み立てるモジュールへ到達してはならない。
vi.mock("../sincroAppController", () => {
    throw new Error("Controller must not load");
});
vi.mock("../../bridges/sincroAppControllerRuntime", () => {
    throw new Error("Runtime must not load");
});

it("Controller本体なしで現在値を取得・購読できる", async () => {
    const { getActiveSincroAppController, subscribeCurrentSincroAppController } = await import(
        "../activeSincroAppController"
    );
    const { subscribeActiveSincroAppController } = await import(
        "../subscribeActiveSincroAppController"
    );
    expect(getActiveSincroAppController()).toBeUndefined();
    const seen = vi.fn();
    const unsubscribe = subscribeCurrentSincroAppController(seen);
    expect(seen).toHaveBeenCalledExactlyOnceWith(undefined);
    unsubscribe();
    const release = vi.fn();
    const bind = vi.fn(() => release);
    const unbind = subscribeActiveSincroAppController(bind);
    expect(bind).toHaveBeenCalledExactlyOnceWith(undefined);
    unbind();
    unbind();
    expect(release).toHaveBeenCalledOnce();
});

it("UIの購読入口からController本体を読み込まない", async () => {
    const { subscribeActiveSincroAppEvents } = await import(
        "../../react/subscribeActiveSincroAppEvents"
    );
    const { useChatSnapshot } = await import(
        "../../../features/conversation/chat/react/useChatSnapshot"
    );
    const { useSincroAppControllerSettingsState } = await import(
        "../../react/useSincroAppControllerSettingsState"
    );
    expect(useChatSnapshot).toBeTypeOf("function");
    expect(useSincroAppControllerSettingsState).toBeTypeOf("function");
    const onControllerChange = vi.fn();
    const onEvent = vi.fn();
    const unsubscribe = subscribeActiveSincroAppEvents({ onControllerChange, onEvent });
    expect(onControllerChange).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(onEvent).not.toHaveBeenCalled();
    unsubscribe();
});
