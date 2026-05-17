import { useEffect } from "react";
import {
    closeRightToolMenu,
    toggleRightToolDebugPanel,
    toggleRightToolMenu,
    toggleRightToolSettingsPanel,
    useRightToolPanelState,
} from "../app/useRightToolPanelState";

// 右上メニューと右側ツール領域の見た目/DOMイベントだけを担当する薄い shell。
// state owner は App/service 側に置き、ここでは排他表示と外側クリック閉じを UI として実装する。
export function RightToolMenu() {
    const state = useRightToolPanelState();
    const settingsActive = state.activePanel === "settings";
    const debugActive = state.activePanel === "debug";
    const currentToolLabel = settingsActive ? "基本設定" : debugActive ? "開発者ツール" : "未選択";

    useEffect(() => {
        const handleClick = (event: MouseEvent): void => {
            if (!(event.target instanceof Node)) {
                return;
            }
            const debugMenu = document.getElementById("debugMenu");
            if (state.menuOpen && debugMenu && !debugMenu.contains(event.target)) {
                closeRightToolMenu();
            }
        };
        document.addEventListener("click", handleClick, true);
        return () => {
            document.removeEventListener("click", handleClick, true);
        };
    }, [state.menuOpen]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.ctrlKey && event.altKey && (event.key === "d" || event.code === "KeyD")) {
                toggleRightToolDebugPanel();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    return (
        <div id="debugMenu" className={state.menuOpen ? "is-open" : ""}>
            <button
                id="debugMenuButton"
                type="button"
                aria-label={`右側ツールメニューを${state.menuOpen ? "閉じる" : "開く"}。現在のツール: ${currentToolLabel}`}
                aria-expanded={state.menuOpen}
                aria-haspopup="menu"
                aria-pressed={state.activePanel !== "none"}
                aria-controls="debugMenuPanel"
                onClick={toggleRightToolMenu}
            >
                <svg className="debugMenuButton__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.32 7.32 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42L9.13 5.07c-.62.23-1.2.55-1.73.95l-2.44-.98a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64L4.57 11c-.05.33-.07.66-.07 1s.02.67.07 1l-2.1 1.64a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.44-.98c.53.4 1.11.72 1.73.95l.38 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .49-.42l.38-2.65c.61-.23 1.19-.55 1.72-.95l2.45.98a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64L19.43 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                </svg>
            </button>
            <div
                id="debugMenuPanel"
                role="menu"
                aria-hidden={!state.menuOpen}
                aria-label="右側ツール"
            >
                <button
                    id="reactSettingsPanelToggle"
                    type="button"
                    role="menuitem"
                    className={settingsActive ? "is-active" : ""}
                    aria-current={settingsActive ? "page" : undefined}
                    onClick={toggleRightToolSettingsPanel}
                >
                    <span className="debugMenuPanel__itemText">
                        <span className="debugMenuPanel__itemTitle">基本設定</span>
                    </span>
                </button>
                <button
                    id="debugConsoleToggle"
                    type="button"
                    role="menuitem"
                    className={debugActive ? "is-active" : ""}
                    aria-current={debugActive ? "page" : undefined}
                    onClick={toggleRightToolDebugPanel}
                >
                    <span className="debugMenuPanel__itemText">
                        <span className="debugMenuPanel__itemTitle">開発者ツール</span>
                    </span>
                </button>
            </div>
        </div>
    );
}
