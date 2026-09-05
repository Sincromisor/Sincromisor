/** アプリから初期化処理とReactへ公開する操作窓口。サービスの所有権は移さない。 */

/** ダイアログ操作とVRM保存・現在の起動設定を取得する窓口。 */
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
    getMessageViewSnapshot: () => import("../controller/sincroAppTypes").ChatMessageViewRecord[];
    getSystemIconUrl: () => string;
};

/** 診断画面の停止操作と右側パネルの表示・購読を扱う窓口。 */
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

/** アプリが管理する状態遷移を経由してRTCを停止する窓口。 */
export type SincroAppRtcBridge = {
    stop: () => void;
};

/** シーン設定と、設定購読とは別に保持する画面状態の取得窓口。 */
export type SincroAppStateBridge = {
    getSettingsSnapshot: () => import("../controller/sincroAppTypes").SincroAppSettingsSnapshot;
    getDialogUiState: () => import("../controller/sincroAppTypes").SincroAppDialogUiState;
    getDialogVrmUiState: () => import("../controller/sincroAppTypes").SincroAppDialogVrmUiState;
    getStartupSettingsStatus: () => import("../controller/sincroAppTypes").SincroAppStartupSettingsStatus;
    getTelopTextSegmentsSnapshot: () => import("../controller/sincroAppTypes").TelopTextSegment[];
};
