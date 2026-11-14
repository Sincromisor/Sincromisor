import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { frontendLogger } from "../../../../shared/logging/appLogger";
import { DebugConsole } from "../debugConsole";
import { DebugConsoleErrorBoundary } from "../debugConsoleErrorBoundary";

const { loadPanels } = vi.hoisted(() => ({ loadPanels: vi.fn() }));
// 評価された時点を数え、非表示の入口から詳細表示の取得が始まらないことを確認する。
vi.mock("../debugConsolePanels", () => {
    loadPanels();
    return { DebugConsolePanels: () => <p>診断の詳細</p> };
});

it("初回非表示では詳細を読み込まず、追跡・受信音声DOMを一つずつ常設する", () => {
    const markup = renderToStaticMarkup(<DebugConsole isVisible={false} />);
    for (const id of ["characterGazeVideo", "characterGazeMarker", "eyeTarget", "rtcAudio"]) {
        expect(markup.split(`id="${id}"`)).toHaveLength(2);
    }
    expect(markup).toContain('class="gazePanelDetails"');
    expect(loadPanels).not.toHaveBeenCalled();
    expect(markup).not.toContain("診断表示を読み込んでいます。");
});

it("初回表示で読み込みを開始し、待機中の案内と常設DOMを配置する", async () => {
    const markup = renderToStaticMarkup(<DebugConsole />);
    expect(markup).toContain("診断表示を読み込んでいます。");
    expect(markup).toContain('id="rtcAudio"');
    expect(markup).toContain('id="characterGazeVideo"');
    await vi.waitFor(() => expect(loadPanels).toHaveBeenCalledOnce());
});

it.each(["Failed to fetch dynamically imported module", "Panel render failed"])(
    "詳細の失敗を記録し、ページ再読み込みの案内を診断欄へ返す（%s）",
    (message) => {
        const logError = vi.spyOn(frontendLogger, "error").mockImplementation(() => {});
        try {
            const boundary = new DebugConsoleErrorBoundary({ children: <p>診断の詳細</p> });
            expect(renderToStaticMarkup(boundary.render())).toContain("診断の詳細");
            const error = new Error(message);
            boundary.state = DebugConsoleErrorBoundary.getDerivedStateFromError();
            boundary.componentDidCatch(error);
            const markup = renderToStaticMarkup(boundary.render());
            expect(markup).toContain('role="alert"');
            expect(markup).toContain("ページを再読み込みしてください");
            expect(markup).not.toContain("診断の詳細");
            expect(logError).toHaveBeenCalledExactlyOnceWith(
                "Failed to load or render debug panels.",
                { error },
            );
        } finally {
            logError.mockRestore();
        }
    },
);
