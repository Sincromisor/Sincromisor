import { useEffect, useSyncExternalStore } from "react";
import {
    closeRightToolMenu,
    getRightToolPanelState,
    subscribeRightToolPanelState,
    toggleDebugConsole,
    toggleReactSettingsPanel,
    toggleRightToolMenu,
} from "../../ts/UI/rightToolPanelStore";

function useRightToolPanelState() {
    return useSyncExternalStore(
        subscribeRightToolPanelState,
        getRightToolPanelState,
        getRightToolPanelState,
    );
}

function blockPointerEvent(element: HTMLElement | null): (() => void) | null {
    if (!element) {
        return null;
    }
    const stop = (event: Event): void => {
        event.stopPropagation();
    };
    const eventNames: Array<keyof GlobalEventHandlersEventMap> = [
        "pointerdown",
        "pointerup",
        "touchstart",
        "touchend",
        "mousedown",
        "mouseup",
        "wheel",
        "click",
    ];
    eventNames.forEach((eventName) => {
        element.addEventListener(eventName, stop);
    });
    return () => {
        eventNames.forEach((eventName) => {
            element.removeEventListener(eventName, stop);
        });
    };
}

function syncContainerVisibility(containerId: string, isOpen: boolean): void {
    const container = document.getElementById(containerId);
    if (!container) {
        return;
    }
    container.classList.toggle("is-open", isOpen);
    container.style.visibility = isOpen ? "visible" : "hidden";
    if (containerId === "sincroDebugConsoleContainer") {
        container.style.overflow = isOpen ? "visible" : "hidden";
    }
}

// 右上メニューと右側ツール領域の開閉ルールを React 側で所有する薄い shell。
// 設定パネル本体と Debug Console 本体は別 island に分け、ここでは排他表示と外側クリック閉じを担当する。
export function RightToolMenu() {
    const state = useRightToolPanelState();

    useEffect(() => {
        syncContainerVisibility("sincroDebugConsoleContainer", state.activePanel === "debug");
        syncContainerVisibility("sincroReactSettingsPanelContainer", state.activePanel === "settings");
    }, [state.activePanel]);

    useEffect(() => {
        const cleanups = [
            blockPointerEvent(document.getElementById("debugMenu")),
            blockPointerEvent(document.getElementById("debugConsole")),
            blockPointerEvent(document.getElementById("reactSettingsPanel")),
        ].filter((cleanup): cleanup is () => void => typeof cleanup === "function");
        return () => {
            cleanups.forEach((cleanup) => cleanup());
        };
    }, []);

    useEffect(() => {
        const handleClick = (event: MouseEvent): void => {
            const target = event.target as Node | null;
            if (!target) {
                return;
            }
            const debugMenu = document.getElementById("debugMenu");
            const debugConsole = document.getElementById("debugConsole");
            const reactSettingsPanel = document.getElementById("reactSettingsPanel");
            if (state.menuOpen && debugMenu && !debugMenu.contains(target)) {
                closeRightToolMenu();
            }
            if (state.activePanel === "debug" && debugConsole && !debugConsole.contains(target) && !debugMenu?.contains(target)) {
                toggleDebugConsole();
                return;
            }
            if (state.activePanel === "settings" && reactSettingsPanel && !reactSettingsPanel.contains(target) && !debugMenu?.contains(target)) {
                toggleReactSettingsPanel();
            }
        };
        document.addEventListener("click", handleClick, true);
        return () => {
            document.removeEventListener("click", handleClick, true);
        };
    }, [state.activePanel, state.menuOpen]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (event.ctrlKey && event.altKey && (event.key === "d" || event.code === "KeyD")) {
                toggleDebugConsole();
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
                aria-label="ツールメニューを開く"
                aria-expanded={state.menuOpen}
                aria-controls="debugMenuPanel"
                onClick={toggleRightToolMenu}
            >
                <svg className="debugMenuButton__icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.32 7.32 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42L9.13 5.07c-.62.23-1.2.55-1.73.95l-2.44-.98a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64L4.57 11c-.05.33-.07.66-.07 1s.02.67.07 1l-2.1 1.64a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.44-.98c.53.4 1.11.72 1.73.95l.38 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .49-.42l.38-2.65c.61-.23 1.19-.55 1.72-.95l2.45.98a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64L19.43 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
                </svg>
            </button>
            <div id="debugMenuPanel" role="menu" aria-hidden={!state.menuOpen} aria-label="右側ツール">
                <button id="reactSettingsPanelToggle" type="button" role="menuitem" onClick={toggleReactSettingsPanel}>
                    設定
                </button>
                <button id="debugConsoleToggle" type="button" role="menuitem" onClick={toggleDebugConsole}>
                    開発者向け診断
                </button>
            </div>
        </div>
    );
}
