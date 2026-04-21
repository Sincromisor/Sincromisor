import type { ChatMessageManager } from "../UI/ChatMessageManager";
import type { DebugConsoleManager } from "../UI/DebugConsoleManager";
import type { PopManager } from "../UI/PopManager";
import type { TalkManager } from "../RTC/TalkManager";
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
    // DialogManager/PopManager を UI 向けの最小 API に絞って公開する bridge。
    // 呼び出し側は DialogManager 実装の詳細を意識せず AppController.dialog 経由で扱える。
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

export function createSincroAppChatBridge(
    chatMessageManager: ChatMessageManager,
    talkManager: TalkManager,
): SincroAppChatBridge {
    // initializer 側で頻出する chat 操作だけを集約し、ChatMessageManager の直接 import を減らす。
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
        setDomRenderingEnabled: (enabled) => {
            chatMessageManager.setDomRenderingEnabled(enabled);
        },
        setTelopDomRenderingEnabled: (enabled) => {
            talkManager.setTelopDomRenderingEnabled(enabled);
        },
        getMessageViewSnapshot: () => chatMessageManager.getMessageViewSnapshot(),
        getSystemIconUrl: () => chatMessageManager.getSystemIconUrl(),
    };
}

export function createSincroAppDebugBridge(debugConsoleManager: DebugConsoleManager): SincroAppDebugBridge {
    // 現時点の debug bridge は停止ボタン配線のみ。将来の debug UI 操作追加の拡張点として残す。
    return {
        setRTCStopButtonEventListener: (stopFunction) => {
            debugConsoleManager.setRTCStopButtonEventListener(stopFunction);
        },
    };
}

export function createSincroAppRtcBridge(params: { stopRTC: () => void; }): SincroAppRtcBridge {
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
    getTelopTextSegmentsSnapshot: () => import("./SincroAppTypes").TelopTextSegment[];
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
