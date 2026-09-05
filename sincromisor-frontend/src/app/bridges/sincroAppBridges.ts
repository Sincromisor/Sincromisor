// SincroAppController から公開する UI/運用向け bridge API の型定義。
// 呼び出し側（initializer / React hook）で責務を読みやすくするため、実装から分離して管理する。

export type SincroAppDialogBridge = {
    applySelectedVrmFile: (file: File) => void;
    setVrmDragOver: (isDragOver: boolean) => void;
    close: () => void;
    open: () => void;
    updateUserMediaAvailabilityStatus: (available: boolean) => void;
    updateCharacterAvailabilityStatus: (available: boolean) => void;
    isCharacterEnabled: () => boolean;
    isVREnabled: () => boolean;
    isInspectorEnabled: () => boolean;
    loadVrmThumbnailBlob: () => Promise<Blob | undefined>;
    saveVrmThumbnailBlob: (blob: Blob) => Promise<void>;
    getSelectedVrmUrl: () => string;
};

/** チャットの書き込みとReactの初期履歴取得に使う窓口。 */
export type SincroAppChatBridge = {
    writeUnknownUserMessage: (message: string, isHTML?: boolean) => void;
    writeSystemMessage: (message: string, isHTML?: boolean) => void;
    setSystemIcon: (iconUrl: string) => void;
    setTelopDomRenderingEnabled: (enabled: boolean) => void;
    getMessageViewSnapshot: () => import("../controller/sincroAppTypes").ChatMessageViewRecord[];
    getSystemIconUrl: () => string;
};

export type SincroAppDebugBridge = {
    setRTCStopButtonEventListener: (stopFunction: () => void) => void;
    getRightToolPanelState: () => import("./sincroAppRightToolPanelService").RightToolPanelState;
    subscribeRightToolPanelState: (listener: () => void) => () => void;
    openRightToolMenu: () => void;
    closeRightToolMenu: () => void;
    toggleRightToolMenu: () => void;
    showRightToolDebugPanel: () => void;
    hideRightToolDebugPanel: () => void;
    toggleRightToolDebugPanel: () => void;
    showRightToolSettingsPanel: () => void;
    hideRightToolSettingsPanel: () => void;
    toggleRightToolSettingsPanel: () => void;
};

export type SincroAppRtcBridge = {
    stop: () => void;
};

export type SincroAppStateBridge = {
    getSettingsSnapshot: () => import("../controller/sincroAppTypes").SincroAppSettingsSnapshot;
    getSettingsUiState: () => import("../controller/sincroAppTypes").SincroAppSettingsUiState;
    getSettingsUiHints: () => import("../controller/sincroAppTypes").SincroAppSettingsUiHints;
    getDialogUiState: () => import("../controller/sincroAppTypes").SincroAppDialogUiState;
    getDialogVrmUiState: () => import("../controller/sincroAppTypes").SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => import("../controller/sincroAppTypes").SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("../controller/sincroAppTypes").TelopTextSegment[];
};
