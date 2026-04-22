import { useSyncExternalStore } from "react";
import type { SincroAppDebugBridge } from "../../ts/App/SincroAppBridges";
import { SincroAppController } from "../../ts/App/SincroAppController";
import {
    DEFAULT_RIGHT_TOOL_PANEL_STATE,
    type RightToolPanelState,
} from "../../ts/App/SincroAppRightToolPanelService";

function getRightToolPanelStateSnapshot(): RightToolPanelState {
    return SincroAppController.getCurrent()?.debug.getRightToolPanelState() ?? DEFAULT_RIGHT_TOOL_PANEL_STATE;
}

function subscribeRightToolPanelState(listener: () => void): () => void {
    let unsubscribePanelState = () => { };
    const unsubscribeController = SincroAppController.subscribeCurrent((controller) => {
        unsubscribePanelState();
        if (!controller) {
            listener();
            return;
        }
        unsubscribePanelState = controller.debug.subscribeRightToolPanelState(listener);
        listener();
    });
    return () => {
        unsubscribePanelState();
        unsubscribeController();
    };
}

function getCurrentDebugBridge(): SincroAppDebugBridge | null {
    return SincroAppController.getCurrent()?.debug ?? null;
}

export function useRightToolPanelState(): RightToolPanelState {
    return useSyncExternalStore(
        subscribeRightToolPanelState,
        getRightToolPanelStateSnapshot,
        getRightToolPanelStateSnapshot,
    );
}

// 右側ツール領域の UI操作は current AppController の debug bridge 経由にそろえる。
// React component から App/service 実装へ直接届かないよう、この薄い helper を正規導線にする。
export function openRightToolMenu(): void {
    getCurrentDebugBridge()?.openRightToolMenu();
}

export function closeRightToolMenu(): void {
    getCurrentDebugBridge()?.closeRightToolMenu();
}

export function toggleRightToolMenu(): void {
    getCurrentDebugBridge()?.toggleRightToolMenu();
}

export function showRightToolDebugPanel(): void {
    getCurrentDebugBridge()?.showRightToolDebugPanel();
}

export function hideRightToolDebugPanel(): void {
    getCurrentDebugBridge()?.hideRightToolDebugPanel();
}

export function toggleRightToolDebugPanel(): void {
    getCurrentDebugBridge()?.toggleRightToolDebugPanel();
}

export function showRightToolSettingsPanel(): void {
    getCurrentDebugBridge()?.showRightToolSettingsPanel();
}

export function hideRightToolSettingsPanel(): void {
    getCurrentDebugBridge()?.hideRightToolSettingsPanel();
}

export function toggleRightToolSettingsPanel(): void {
    getCurrentDebugBridge()?.toggleRightToolSettingsPanel();
}
