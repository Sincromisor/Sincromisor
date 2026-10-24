import { useSyncExternalStore } from "react";
import {
    DEFAULT_RIGHT_TOOL_PANEL_STATE,
    getSincroAppRightToolPanelService,
    type RightToolPanelState,
} from "../bridges/sincroAppRightToolPanelService";

const rightToolPanelService = getSincroAppRightToolPanelService();

function getRightToolPanelStateSnapshot(): RightToolPanelState {
    return rightToolPanelService.getState() ?? DEFAULT_RIGHT_TOOL_PANEL_STATE;
}

function subscribeRightToolPanelState(listener: () => void): () => void {
    return rightToolPanelService.subscribe(listener);
}

export function useRightToolPanelState(): RightToolPanelState {
    return useSyncExternalStore(
        subscribeRightToolPanelState,
        getRightToolPanelStateSnapshot,
        getRightToolPanelStateSnapshot,
    );
}

// 右側ツール領域の UI操作は current AppController の debug bridge 経由にそろえる。
// state owner 自体は App/service 側に置き、React からはこの薄い helper を正規導線にする。
export function openRightToolMenu(): void {
    rightToolPanelService.openMenu();
}

export function closeRightToolMenu(): void {
    rightToolPanelService.closeMenu();
}

export function toggleRightToolMenu(): void {
    rightToolPanelService.toggleMenu();
}

export function showRightToolDebugPanel(): void {
    rightToolPanelService.showDebugPanel();
}

export function hideRightToolDebugPanel(): void {
    rightToolPanelService.hideDebugPanel();
}

export function toggleRightToolDebugPanel(): void {
    rightToolPanelService.toggleDebugPanel();
}

export function showRightToolSettingsPanel(): void {
    rightToolPanelService.showSettingsPanel();
}

export function hideRightToolSettingsPanel(): void {
    rightToolPanelService.hideSettingsPanel();
}

export function toggleRightToolSettingsPanel(): void {
    rightToolPanelService.toggleSettingsPanel();
}

/** 会話履歴も通常の右側パネルと同じ排他表示へ結ぶ。 */
export function toggleRightToolHistoryPanel(): void {
    rightToolPanelService.toggleHistoryPanel();
}
/** 履歴だけを閉じ、他のパネルへ切り替わった後の状態を壊さない。 */
export function hideRightToolHistoryPanel(): void {
    rightToolPanelService.hideHistoryPanel();
}
