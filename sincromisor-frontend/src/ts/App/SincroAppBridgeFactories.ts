import type { ChatMessageManager } from "../UI/ChatMessageManager";
import type { DebugConsoleManager } from "../UI/DebugConsoleManager";
import type { PopManager } from "../UI/PopManager";
import type { SincroAppDialogFacade } from "./SincroAppDialogFacade";
import type {
    SincroAppChatBridge,
    SincroAppDebugBridge,
    SincroAppDialogBridge,
    SincroAppRtcBridge,
    SincroAppStateBridge,
} from "./SincroAppBridges";
import type {
    SincroAppDialogUiState,
    SincroAppDialogVrmUiState,
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsStatus,
} from "./SincroAppTypes";

// AppController から公開する bridge 実装を factory に分離し、
// Controller 本体を「依存の束ね役」に寄せる。
export function createSincroAppDialogBridge(params: {
    dialogManager: SincroAppDialogFacade;
    popManager: PopManager;
}): SincroAppDialogBridge {
    const { dialogManager, popManager } = params;
    return {
        setReactPrimarySettingsEnabled: (enabled) => {
            dialogManager.setReactPrimarySettingsEnabled(enabled);
        },
        openVrmFilePicker: () => {
            dialogManager.openVrmFilePicker();
        },
        setPopDomRenderingEnabled: (enabled) => {
            popManager.setDialogPopDomRenderingEnabled(enabled);
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
        isCharacterEnabled: () => dialogManager.enableCharacter(),
        isVREnabled: () => dialogManager.enableVR(),
        isInspectorEnabled: () => dialogManager.enableInspector(),
        loadVrmThumbnailBlob: () => dialogManager.loadVrmThumbnailBlob(),
        saveVrmThumbnailBlob: async (blob) => {
            await dialogManager.saveVrmThumbnailBlob(blob);
        },
        getSelectedVrmUrl: () => dialogManager.getSelectedVrmUrl(),
    };
}

export function createSincroAppChatBridge(chatMessageManager: ChatMessageManager): SincroAppChatBridge {
    return {
        writeUnknownUserMessage: (message, isHTML) => {
            chatMessageManager.writeUnknownUserMessage(message, isHTML);
        },
        writeSystemMessage: (message, isHTML) => {
            chatMessageManager.writeSystemMessage(message, isHTML);
        },
        setSystemIcon: (iconUrl) => {
            chatMessageManager.setSystemIcon(iconUrl);
        },
    };
}

export function createSincroAppDebugBridge(debugConsoleManager: DebugConsoleManager): SincroAppDebugBridge {
    return {
        setRTCStopButtonEventListener: (stopFunction) => {
            debugConsoleManager.setRTCStopButtonEventListener(stopFunction);
        },
    };
}

export function createSincroAppRtcBridge(params: { stopRTC: () => void; }): SincroAppRtcBridge {
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
}): SincroAppStateBridge {
    return {
        getSettingsSnapshot: params.getSettingsSnapshot,
        getSettingsUiState: params.getSettingsUiState,
        getSettingsUiHints: params.getSettingsUiHints,
        getDialogUiState: params.getDialogUiState,
        getDialogVrmUiState: params.getDialogVrmUiState,
        getStartupSettingsStatus: params.getStartupSettingsStatus,
    };
}
