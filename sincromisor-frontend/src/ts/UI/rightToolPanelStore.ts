export type RightToolPanelKind = "none" | "settings" | "debug";

export type RightToolPanelState = {
    activePanel: RightToolPanelKind;
    menuOpen: boolean;
};

let state: RightToolPanelState = {
    activePanel: "none",
    menuOpen: false,
};

const listeners = new Set<() => void>();

function emitChange(): void {
    for (const listener of listeners) {
        listener();
    }
}

function updateState(nextState: RightToolPanelState): void {
    if (
        nextState.activePanel === state.activePanel
        && nextState.menuOpen === state.menuOpen
    ) {
        return;
    }
    state = nextState;
    emitChange();
}

export function getRightToolPanelState(): RightToolPanelState {
    return state;
}

export function subscribeRightToolPanelState(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function closeRightToolMenu(): void {
    updateState({ ...state, menuOpen: false });
}

export function openRightToolMenu(): void {
    updateState({ ...state, menuOpen: true });
}

export function toggleRightToolMenu(): void {
    updateState({ ...state, menuOpen: !state.menuOpen });
}

export function closeAllRightToolPanels(): void {
    updateState({
        activePanel: "none",
        menuOpen: false,
    });
}

export function showDebugConsole(): void {
    updateState({
        activePanel: "debug",
        menuOpen: false,
    });
}

export function hideDebugConsole(): void {
    if (state.activePanel !== "debug") {
        return;
    }
    updateState({
        activePanel: "none",
        menuOpen: false,
    });
}

export function toggleDebugConsole(): void {
    if (state.activePanel === "debug") {
        hideDebugConsole();
        return;
    }
    showDebugConsole();
}

export function showReactSettingsPanel(): void {
    updateState({
        activePanel: "settings",
        menuOpen: false,
    });
}

export function hideReactSettingsPanel(): void {
    if (state.activePanel !== "settings") {
        return;
    }
    updateState({
        activePanel: "none",
        menuOpen: false,
    });
}

export function toggleReactSettingsPanel(): void {
    if (state.activePanel === "settings") {
        hideReactSettingsPanel();
        return;
    }
    showReactSettingsPanel();
}
