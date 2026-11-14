import { type KeyboardEventHandler, useEffect, useLayoutEffect, useRef } from "react";
import {
    closeRightToolMenu,
    openRightToolMenu,
    toggleRightToolDebugPanel,
    toggleRightToolHistoryPanel,
    toggleRightToolSettingsPanel,
    useRightToolPanelState,
} from "../../../app/react/useRightToolPanelState";

import { useSincroExperienceState } from "../../../app/react/useSincroExperienceState";

import { useRightToolMenuKeyboard } from "./useRightToolMenuKeyboard";

/** パネル選択と体験操作の入口。状態の所有者へ委譲し、表示の開閉では機器に触れない。 */
export function RightToolMenu() {
    const state = useRightToolPanelState();
    const onMenuKeyDown = useRightToolMenuKeyboard(state.menuOpen);
    const settingsActive = state.activePanel === "settings";
    const debugActive = state.activePanel === "debug";
    const currentToolLabel = settingsActive
        ? "基本設定"
        : debugActive
          ? "開発者ツール"
          : state.activePanel === "history"
            ? "会話履歴"
            : "未選択";
    useDebugPanelShortcut();

    return (
        <div id="debugMenu">
            <RightToolMenuButton
                menuOpen={state.menuOpen}
                onKeyDown={onMenuKeyDown}
                hasActivePanel={state.activePanel !== "none"}
                currentToolLabel={currentToolLabel}
            />
            <RightToolMenuPanel
                menuOpen={state.menuOpen}
                onKeyDown={onMenuKeyDown}
                settingsActive={settingsActive}
                debugActive={debugActive}
                historyActive={state.activePanel === "history"}
            />
        </div>
    );
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
    onKeyDown,
}: {
    menuOpen: boolean;
    hasActivePanel: boolean;
    currentToolLabel: string;
    onKeyDown: KeyboardEventHandler<HTMLElement>;
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
            popoverTarget="debugMenuPanel"
            onKeyDown={onKeyDown}
        >
            <svg className="debugMenuButton__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.08-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.32 7.32 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.49.42L9.13 5.07c-.62.23-1.2.55-1.73.95l-2.44-.98a.5.5 0 0 0-.61.22l-2 3.46a.5.5 0 0 0 .12.64L4.57 11c-.05.33-.07.66-.07 1s.02.67.07 1l-2.1 1.64a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .61.22l2.44-.98c.53.4 1.11.72 1.73.95l.38 2.65A.5.5 0 0 0 10 22h4a.5.5 0 0 0 .49-.42l.38-2.65c.61-.23 1.19-.55 1.72-.95l2.45.98a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64L19.43 13zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z" />
            </svg>
        </button>
    );
}

/** 表示はPopover、アプリ状態はパネルサービスと相互に同期する。 */
function RightToolMenuPanel({
    menuOpen,
    settingsActive,
    debugActive,
    historyActive,
    onKeyDown,
}: {
    menuOpen: boolean;
    settingsActive: boolean;
    debugActive: boolean;
    historyActive: boolean;
    onKeyDown: KeyboardEventHandler<HTMLElement>;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    // キー操作やパネル選択による要求も、ブラウザーが所有する同じ表示状態へ反映する。
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel || panel.matches(":popover-open") === menuOpen) return;
        if (menuOpen) {
            const source = document.getElementById("debugMenuButton");
            if (source) panel.showPopover({ source });
        } else panel.hidePopover();
    }, [menuOpen]);
    const syncOpenState = () => {
        if (panelRef.current?.matches(":popover-open")) openRightToolMenu();
        else closeRightToolMenu();
    };
    return (
        <div
            id="debugMenuPanel"
            role="menu"
            ref={panelRef}
            popover="auto"
            onToggle={syncOpenState}
            onClickCapture={(event) => {
                // 開閉通知前に項目を実行しても閉じられるよう、まず実際のPopoverを閉じる。
                if (event.target instanceof Element && event.target.closest('[role="menuitem"]'))
                    panelRef.current?.hidePopover();
            }}
            aria-label="右側ツール"
            onKeyDown={onKeyDown}
        >
            <RightToolMenuItem
                id="historyPanelToggle"
                isActive={historyActive}
                onClick={toggleRightToolHistoryPanel}
                title="会話履歴"
            />
            <RightToolMenuItem
                id="reactSettingsPanelToggle"
                isActive={settingsActive}
                onClick={toggleRightToolSettingsPanel}
                title="基本設定"
            />
            <ExperienceMenuItem />
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

/** パネル選択とは独立した実行操作。終了処理が失敗しても、閉じた項目にフォーカスを残さない。 */
function ExperienceMenuItem() {
    const { media, controller } = useSincroExperienceState();
    const canEnd = media.experienceActive || media.microphone !== "idle" || media.camera !== "idle";
    return (
        <button
            type="button"
            role="menuitem"
            disabled={!controller}
            onClick={() => {
                try {
                    if (canEnd) controller?.endExperience();
                    else controller?.start();
                } finally {
                    closeRightToolMenu();
                    document.getElementById("debugMenuButton")?.focus();
                }
            }}
        >
            <span className="debugMenuPanel__itemTitle">
                {canEnd ? "体験を終了" : "体験を開始"}
            </span>
        </button>
    );
}
