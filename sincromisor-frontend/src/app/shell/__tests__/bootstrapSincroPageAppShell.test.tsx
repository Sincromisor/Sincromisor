import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { SincroVRMRoots } from "../../bootstrap/sincroVrmInitializer";
import { bootstrapSincroPageAppShell } from "../bootstrapSincroPageAppShell";

const boundary = vi.hoisted(() => {
    const callbacks: {
        loadPanel?: () => Promise<{ default: () => ReactElement | null }>;
        onError?: (error: unknown) => void;
    } = {};
    return {
        callbacks,
        render: vi.fn(),
        unmount: vi.fn(),
        release: vi.fn(),
        end: vi.fn(),
        failure: vi.fn(),
        error: vi.fn(),
        startDiagnostics: vi.fn(),
    };
});
// DOMの描画はブラウザーで確認し、ここでは起動側が所有する遅延読込と終了順を観測する。
vi.mock("react", async (importOriginal) => ({
    ...(await importOriginal<typeof import("react")>()),
    lazy: (load: () => Promise<{ default: () => ReactElement | null }>) => {
        boundary.callbacks.loadPanel = load;
        return () => null;
    },
}));
vi.mock("react-dom/client", () => ({
    createRoot: (_node: HTMLElement, options: { onUncaughtError: (error: unknown) => void }) => {
        boundary.callbacks.onError = options.onUncaughtError;
        return { render: boundary.render, unmount: boundary.unmount };
    },
}));
vi.mock("../sincroPageAppShell", () => ({ SincroPageAppShell: () => null }));
vi.mock("../bootstrapFailureView", () => ({ showBootstrapFailure: boundary.failure }));
vi.mock("../../../shared/logging/appLogger", () => ({
    frontendLogger: { error: boundary.error, diagnostics: { start: boundary.startDiagnostics } },
}));
vi.mock("../../controller/activeSincroAppController", () => ({
    getActiveSincroAppController: () => ({
        releaseEventSubscriptions: boundary.release,
        endExperience: boundary.end,
    }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    boundary.callbacks.loadPanel = undefined;
    boundary.callbacks.onError = undefined;
    const mountNode = { dataset: {}, isConnected: true, inert: false };
    vi.stubGlobal("document", { getElementById: () => mountNode });
});
afterEach(() => vi.unstubAllGlobals());

it("設定の未取得・保留中も共通画面を配置し、配置通知が重なっても初期化は一度だけ", async () => {
    let resolvePanel: ((module: string) => void) | undefined;
    const load = vi.fn(
        () =>
            new Promise<string>((resolve) => {
                resolvePanel = resolve;
            }),
    );
    const render = vi.fn((module: string) => <div>{module}</div>);
    const initialize = vi.fn();
    boundary.render.mockImplementation(
        (element: ReactElement<{ onCharacterMounted: (roots: SincroVRMRoots) => void }>) => {
            const roots = {
                canvasRoot: Object.create(null),
                characterControlLayer: Object.create(null),
            };
            element.props.onCharacterMounted(roots);
            element.props.onCharacterMounted(roots);
        },
    );
    bootstrapSincroPageAppShell(load, render, initialize);
    expect(boundary.render).toHaveBeenCalledOnce();
    expect(initialize).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    const pending = boundary.callbacks.loadPanel?.();
    expect(load).toHaveBeenCalledOnce();
    expect(render).not.toHaveBeenCalled();
    resolvePanel?.("復元済みの設定");
    const panel = await pending;
    panel?.default();
    expect(render).toHaveBeenCalledExactlyOnceWith("復元済みの設定");
    expect(initialize).toHaveBeenCalledOnce();
});

it("開始後の読込拒否も共通失敗処理からアプリを解除・終了する", async () => {
    boundary.render.mockImplementation(() => {});
    bootstrapSincroPageAppShell(
        () => Promise.reject(new Error("panel rejected")),
        () => <div />,
        vi.fn(),
    );
    await boundary.callbacks.loadPanel?.();
    expect(boundary.release).toHaveBeenCalledOnce();
    expect(boundary.end).toHaveBeenCalledOnce();
    expect(boundary.release.mock.invocationCallOrder[0]).toBeLessThan(
        boundary.end.mock.invocationCallOrder[0],
    );
    expect(boundary.unmount).toHaveBeenCalledOnce();
    expect(boundary.failure).toHaveBeenCalledOnce();
});

it("描画失敗後に読込が完了してもパネルを再配置せず、初期化を再実行しない", async () => {
    boundary.render.mockImplementation(() => {});
    let resolvePanel: ((module: string) => void) | undefined;
    const render = vi.fn(() => <div />);
    const initialize = vi.fn();
    bootstrapSincroPageAppShell(
        () =>
            new Promise<string>((resolve) => {
                resolvePanel = resolve;
            }),
        render,
        initialize,
    );
    const pending = boundary.callbacks.loadPanel?.();
    boundary.callbacks.onError?.(new Error("drawing rejected"));
    resolvePanel?.("late");
    const panel = await pending;
    expect(panel?.default()).toBeNull();
    expect(render).not.toHaveBeenCalled();
    expect(initialize).not.toHaveBeenCalled();
    expect(boundary.release).toHaveBeenCalledOnce();
    expect(boundary.failure).toHaveBeenCalledOnce();
});
