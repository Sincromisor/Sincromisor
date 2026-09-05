/** 右側パネルは設定と診断のどちらか一方だけを表示する。 */
export type RightToolPanelKind = "none" | "settings" | "debug";

/** Reactが購読するパネル選択とメニュー開閉の同時点状態。 */
export type RightToolPanelState = {
    activePanel: RightToolPanelKind;
    menuOpen: boolean;
};

/** 初期表示ではメニューとパネルを閉じる。 */
export const DEFAULT_RIGHT_TOOL_PANEL_STATE: RightToolPanelState = {
    activePanel: "none",
    menuOpen: false,
};

/** 右側パネルの相互排他とメニュー開閉を保持し、Reactへ変更を通知する。 */
export class SincroAppRightToolPanelService {
    private state: RightToolPanelState = DEFAULT_RIGHT_TOOL_PANEL_STATE;
    private readonly listeners = new Set<() => void>();

    /** Reactの初期表示・購読用に現在の状態を返す。 */
    getState(): RightToolPanelState {
        return this.state;
    }

    /** 表示変更を購読する。返された関数で呼び出し元が購読を解除する。 */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /** 現在のパネルを保持してメニューを開く。 */
    openMenu(): void {
        this.updateState({ ...this.state, menuOpen: true });
    }

    /** パネル選択を変えずメニューを閉じる。 */
    closeMenu(): void {
        this.updateState({ ...this.state, menuOpen: false });
    }

    /** パネル選択を変えずメニューの開閉を切り替える。 */
    toggleMenu(): void {
        this.updateState({ ...this.state, menuOpen: !this.state.menuOpen });
    }

    /** メニューと選択中のパネルを閉じる。 */
    closeAllPanels(): void {
        this.updateState({
            activePanel: "none",
            menuOpen: false,
        });
    }

    /** メニューを閉じ、設定パネルを診断パネルへ切り替える。 */
    showDebugPanel(): void {
        this.updateState({
            activePanel: "debug",
            menuOpen: false,
        });
    }

    /** 診断パネルが表示中の場合だけ、メニューとパネルを閉じる。 */
    hideDebugPanel(): void {
        if (this.state.activePanel !== "debug") {
            return;
        }
        this.closeAllPanels();
    }

    /** 診断パネルを開閉し、設定パネルとの相互排他を維持する。 */
    toggleDebugPanel(): void {
        if (this.state.activePanel === "debug") {
            this.hideDebugPanel();
            return;
        }
        this.showDebugPanel();
    }

    /** メニューを閉じ、診断パネルを設定パネルへ切り替える。 */
    showSettingsPanel(): void {
        this.updateState({
            activePanel: "settings",
            menuOpen: false,
        });
    }

    /** 設定パネルが表示中の場合だけ、メニューとパネルを閉じる。 */
    hideSettingsPanel(): void {
        if (this.state.activePanel !== "settings") {
            return;
        }
        this.closeAllPanels();
    }

    /** 設定パネルを開閉し、診断パネルとの相互排他を維持する。 */
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
            nextState.activePanel === this.state.activePanel &&
            nextState.menuOpen === this.state.menuOpen
        ) {
            return;
        }
        this.state = nextState;
        this.emitChange();
    }
}

let rightToolPanelService: SincroAppRightToolPanelService | undefined;

/** ページ内で共有する右側パネル状態を初回だけ生成する。 */
export function getSincroAppRightToolPanelService(): SincroAppRightToolPanelService {
    if (rightToolPanelService === undefined) {
        rightToolPanelService = new SincroAppRightToolPanelService();
    }
    return rightToolPanelService;
}
