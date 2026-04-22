export type RightToolPanelKind = "none" | "settings" | "debug";

export type RightToolPanelState = {
    activePanel: RightToolPanelKind;
    menuOpen: boolean;
};

export const DEFAULT_RIGHT_TOOL_PANEL_STATE: RightToolPanelState = {
    activePanel: "none",
    menuOpen: false,
};

// 右側ツール領域の表示ルールを App/service 側で所有する軽量 store。
// React はこの service を正規 state owner として購読し、DebugConsoleManager へ UI owner 責務を戻さない。
export class SincroAppRightToolPanelService {
    private state: RightToolPanelState = DEFAULT_RIGHT_TOOL_PANEL_STATE;
    private readonly listeners = new Set<() => void>();

    getState(): RightToolPanelState {
        return this.state;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    openMenu(): void {
        this.updateState({ ...this.state, menuOpen: true });
    }

    closeMenu(): void {
        this.updateState({ ...this.state, menuOpen: false });
    }

    toggleMenu(): void {
        this.updateState({ ...this.state, menuOpen: !this.state.menuOpen });
    }

    closeAllPanels(): void {
        this.updateState({
            activePanel: "none",
            menuOpen: false,
        });
    }

    showDebugPanel(): void {
        this.updateState({
            activePanel: "debug",
            menuOpen: false,
        });
    }

    hideDebugPanel(): void {
        if (this.state.activePanel !== "debug") {
            return;
        }
        this.closeAllPanels();
    }

    toggleDebugPanel(): void {
        if (this.state.activePanel === "debug") {
            this.hideDebugPanel();
            return;
        }
        this.showDebugPanel();
    }

    showSettingsPanel(): void {
        this.updateState({
            activePanel: "settings",
            menuOpen: false,
        });
    }

    hideSettingsPanel(): void {
        if (this.state.activePanel !== "settings") {
            return;
        }
        this.closeAllPanels();
    }

    toggleSettingsPanel(): void {
        if (this.state.activePanel === "settings") {
            this.hideSettingsPanel();
            return;
        }
        this.showSettingsPanel();
    }

    private emitChange(): void {
        for (const listener of this.listeners) {
            listener();
        }
    }

    private updateState(nextState: RightToolPanelState): void {
        if (
            nextState.activePanel === this.state.activePanel
            && nextState.menuOpen === this.state.menuOpen
        ) {
            return;
        }
        this.state = nextState;
        this.emitChange();
    }
}

let rightToolPanelService: SincroAppRightToolPanelService | null = null;

export function getSincroAppRightToolPanelService(): SincroAppRightToolPanelService {
    if (!rightToolPanelService) {
        rightToolPanelService = new SincroAppRightToolPanelService();
    }
    return rightToolPanelService;
}
