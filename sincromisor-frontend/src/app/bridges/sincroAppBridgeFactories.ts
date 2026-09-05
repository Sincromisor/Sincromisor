import type { ChatMessageService } from "../../features/conversation/chat/model/chatMessageService";
import type { DebugConsoleManager } from "../../features/debug/model/debugConsoleManager";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsStatus,
} from "../controller/sincroAppTypes";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./sincroAppBridges";
import type { SincroAppDialogFacade } from "./sincroAppDialogFacade";
import { getSincroAppRightToolPanelService } from "./sincroAppRightToolPanelService";

/** UIと起動処理に必要な操作を公開する。設定の問い合わせは呼び出し時の正本を参照する。 */
export function createSincroAppDialogBridge(params: {
    dialogManager: SincroAppDialogFacade;
}): SincroAppDialogBridge {
    // DialogManager を UI 向けの最小 API に絞って公開する bridge。
    // 呼び出し側は DialogManager 実装の詳細を意識せず AppController.dialog 経由で扱える。
    const { dialogManager } = params;
    return {
        applySelectedVrmFile: (file) => {
            dialogManager.applySelectedVrmFile(file);
        },
        setVrmDragOver: (isDragOver) => {
            dialogManager.setVrmDragOver(isDragOver);
        },
        close: () => {
            dialogManager.closeDialog();
        },
        open: () => {
            dialogManager.showDialog();
        },
        updateUserMediaAvailabilityStatus: (available) => {
            dialogManager.updateUserMediaAvailabilityStatus(available);
        },
        updateCharacterAvailabilityStatus: (available) => {
            dialogManager.updateCharacterStatus(available);
        },
        isCharacterEnabled: () => dialogManager.getSetting("enableCharacter"),
        isVREnabled: () => dialogManager.getSetting("enableVR"),
        isInspectorEnabled: () => dialogManager.getSetting("enableInspector"),
        loadVrmThumbnailBlob: () => dialogManager.loadVrmThumbnailBlob(),
        saveVrmThumbnailBlob: async (blob) => {
            await dialogManager.saveVrmThumbnailBlob(blob);
        },
        getSelectedVrmUrl: () => dialogManager.getSelectedVrmUrl(),
    };
}

/** 初期化処理とReactへ、チャット履歴・通知に対応する操作を公開する。 */
export function createSincroAppChatBridge(
    chatMessageService: ChatMessageService,
): SincroAppChatBridge {
    // initializer 側で頻出する chat 操作だけを集約し、ChatMessageService の直接 import を減らす。
    return {
        writeUnknownUserMessage: (message, isHTML) => {
            chatMessageService.writeUnknownUserMessage(message, isHTML);
        },
        writeSystemMessage: (message, isHTML) => {
            chatMessageService.writeSystemMessage(message, isHTML);
        },
        setSystemIcon: (iconUrl) => {
            chatMessageService.setSystemIcon(iconUrl);
        },
        getMessageViewSnapshot: () => chatMessageService.getMessageViewSnapshot(),
        getSystemIconUrl: () => chatMessageService.getSystemIconUrl(),
    };
}

export function createSincroAppDebugBridge(
    debugConsoleManager: DebugConsoleManager,
): SincroAppDebugBridge {
    // Debug Console callback と右側ツール領域 state/service をまとめて公開し、
    // React 側の UI manager/store 直接依存を減らす。
    const rightToolPanelService = getSincroAppRightToolPanelService();
    return {
        setRTCStopButtonEventListener: (stopFunction) => {
            debugConsoleManager.setRTCStopButtonEventListener(stopFunction);
        },
        getRightToolPanelState: () => rightToolPanelService.getState(),
        subscribeRightToolPanelState: (listener) => rightToolPanelService.subscribe(listener),
        openRightToolMenu: () => {
            rightToolPanelService.openMenu();
        },
        closeRightToolMenu: () => {
            rightToolPanelService.closeMenu();
        },
        toggleRightToolMenu: () => {
            rightToolPanelService.toggleMenu();
        },
        showRightToolDebugPanel: () => {
            rightToolPanelService.showDebugPanel();
        },
        hideRightToolDebugPanel: () => {
            rightToolPanelService.hideDebugPanel();
        },
        toggleRightToolDebugPanel: () => {
            rightToolPanelService.toggleDebugPanel();
        },
        showRightToolSettingsPanel: () => {
            rightToolPanelService.showSettingsPanel();
        },
        hideRightToolSettingsPanel: () => {
            rightToolPanelService.hideSettingsPanel();
        },
        toggleRightToolSettingsPanel: () => {
            rightToolPanelService.toggleSettingsPanel();
        },
    };
}

export function createSincroAppRtcBridge(params: { stopRTC: () => void }): SincroAppRtcBridge {
    // stop は UI から多用されるため bridge に寄せる。start は AppController.start() の状態遷移制御を使う。
    return {
        stop: () => {
            params.stopRTC();
        },
    };
}

export function createSincroAppStateBridge(params: {
    getSettingsSnapshot: () => SincroAppSettingsSnapshot;
    getSettingsUiState: () => SincroAppSettingsUiState;
    getSettingsUiHints: () => SincroAppSettingsUiHints;
    getDialogUiState: () => SincroAppDialogUiState;
    getDialogVrmUiState: () => SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("../controller/sincroAppTypes").TelopTextSegment[];
}): SincroAppStateBridge {
    // React hook が subscribe 前に初期値を同期取得するための読み取り専用 bridge。
    return {
        getSettingsSnapshot: params.getSettingsSnapshot,
        getSettingsUiState: params.getSettingsUiState,
        getSettingsUiHints: params.getSettingsUiHints,
        getDialogUiState: params.getDialogUiState,
        getDialogVrmUiState: params.getDialogVrmUiState,
        getStartupSettingsStatus: params.getStartupSettingsStatus,
        getTelopTextSegmentsSnapshot: params.getTelopTextSegmentsSnapshot,
    };
}
