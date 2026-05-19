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

export type SincroAppChatBridge = {
    writeUnknownUserMessage: (message: string, isHTML?: boolean) => void;
    writeSystemMessage: (message: string, isHTML?: boolean) => void;
    setSystemIcon: (iconUrl: string) => void;
    setDomRenderingEnabled: (enabled: boolean) => void;
    setTelopDomRenderingEnabled: (enabled: boolean) => void;
    getMessageViewSnapshot: () => import("../../app/controller/sincroAppTypes").ChatMessageViewRecord[];
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
    getSettingsSnapshot: () => import("../../app/controller/sincroAppTypes").SincroAppSettingsSnapshot;
    getSettingsUiState: () => import("../../app/controller/sincroAppTypes").SincroAppSettingsUiState;
    getSettingsUiHints: () => import("../../app/controller/sincroAppTypes").SincroAppSettingsUiHints;
    getDialogUiState: () => import("../../app/controller/sincroAppTypes").SincroAppDialogUiState;
    getDialogVrmUiState: () => import("../../app/controller/sincroAppTypes").SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => import("../../app/controller/sincroAppTypes").SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("../../app/controller/sincroAppTypes").TelopTextSegment[];
};
