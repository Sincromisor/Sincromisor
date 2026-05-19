import { useEffect } from "react";
import {
    closeRightToolMenu,
    toggleRightToolDebugPanel,
    toggleRightToolMenu,
    toggleRightToolSettingsPanel,
    useRightToolPanelState,
} from "../../../app/react/useRightToolPanelState";

// 右上メニューと右側ツール領域の見た目/DOMイベントだけを担当する薄い shell。
// state owner は App/service 側に置き、ここでは排他表示と外側クリック閉じを UI として実装する。
export function RightToolMenu() {
    const state = useRightToolPanelState();
    const settingsActive = state.activePanel === "settings";
    const debugActive = state.activePanel === "debug";
    const currentToolLabel = settingsActive ? "基本設定" : debugActive ? "開発者ツール" : "未選択";
    useCloseMenuOnOutsideClick(state.menuOpen);
    useDebugPanelShortcut();

    return (
        <div id="debugMenu" className={state.menuOpen ? "is-open" : ""}>
            <RightToolMenuButton
                menuOpen={state.menuOpen}
                hasActivePanel={state.activePanel !== "none"}
                currentToolLabel={currentToolLabel}
            />
            <RightToolMenuPanel
                menuOpen={state.menuOpen}
                settingsActive={settingsActive}
                debugActive={debugActive}
            />
        </div>
    );
}

function useCloseMenuOnOutsideClick(menuOpen: boolean): void {
    useEffect(() => {
        const handleClick = (event: MouseEvent): void => {
            if (!(event.target instanceof Node)) {
                return;
            }
            const debugMenu = document.getElementById("debugMenu");
            if (menuOpen && debugMenu && !debugMenu.contains(event.target)) {
                closeRightToolMenu();
            }
        };
        document.addEventListener("click", handleClick, true);
        return () => {
            document.removeEventListener("click", handleClick, true);
        };
    }, [menuOpen]);
}

function useDebugPanelShortcut(): void {
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
}

function RightToolMenuButton({
    menuOpen,
    hasActivePanel,
    currentToolLabel,
}: {
    menuOpen: boolean;
    hasActivePanel: boolean;
    currentToolLabel: string;
}) {
    return (
        <button
            id="debugMenuButton"
            type="button"
            aria-label={`右側ツールメニューを${menuOpen ? "閉じる" : "開く"}。現在のツール: ${currentToolLabel}`}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-pressed={hasActivePanel}
            aria-controls="debugMenuPanel"
            onClick={toggleRightToolMenu}
        >
            <svg className="debugMenuButton__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.32 7.32 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42L9.13 5.07c-.62.23-1.2.55-1.73.95l-2.44-.98a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64L4.57 11c-.05.33-.07.66-.07 1s.02.67.07 1l-2.1 1.64a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.44-.98c.53.4 1.11.72 1.73.95l.38 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .49-.42l.38-2.65c.61-.23 1.19-.55 1.72-.95l2.45.98a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64L19.43 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
            </svg>
        </button>
    );
}

function RightToolMenuPanel({
    menuOpen,
    settingsActive,
    debugActive,
}: {
    menuOpen: boolean;
    settingsActive: boolean;
    debugActive: boolean;
}) {
    return (
        <div id="debugMenuPanel" role="menu" aria-hidden={!menuOpen} aria-label="右側ツール">
            <RightToolMenuItem
                id="reactSettingsPanelToggle"
                isActive={settingsActive}
                onClick={toggleRightToolSettingsPanel}
                title="基本設定"
            />
            <RightToolMenuItem
                id="debugConsoleToggle"
                isActive={debugActive}
                onClick={toggleRightToolDebugPanel}
                title="開発者ツール"
            />
        </div>
    );
}

function RightToolMenuItem({
    id,
    isActive,
    onClick,
    title,
}: {
    id: string;
    isActive: boolean;
    onClick: () => void;
    title: string;
}) {
    return (
        <button
            id={id}
            type="button"
            role="menuitem"
            className={isActive ? "is-active" : ""}
            aria-current={isActive ? "page" : undefined}
            onClick={onClick}
        >
            <span className="debugMenuPanel__itemText">
                <span className="debugMenuPanel__itemTitle">{title}</span>
            </span>
        </button>
    );
}
