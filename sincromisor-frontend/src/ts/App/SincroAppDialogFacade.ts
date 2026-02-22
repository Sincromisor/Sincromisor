import type {
    DialogSettingsUiHints,
    DialogSettingsUiState,
    DialogUiState,
    DialogVrmUiState,
} from "../UI/DialogManager";

// SincroAppController 系 helper が DialogManager に期待する最小インターフェース。
// 具体クラス依存を薄め、snapshot/apply/bridge factory の責務境界を明確化する。
export type SincroAppDialogFacade = {
    setReactPrimarySettingsEnabled(enabled: boolean): void;
    openVrmFilePicker(): void;
    closeDialog(): void;
    showDialog(): void;
    updateUserMediaAvailabilityStatus(available: boolean): void;
    updateCharacterStatus(available: boolean): void;
    enableCharacter(): boolean;
    enableVR(): boolean;
    enableInspector(): boolean;
    loadVrmThumbnailBlob(): Promise<Blob | null>;
    saveVrmThumbnailBlob(blob: Blob): Promise<void>;
    getSelectedVrmUrl(): string;

    titleText(): string;
    talkMode(): string;
    enableTalk(): boolean;
    enableCharacterGaze(): boolean;
    enableAutoMute(): boolean;
    enableNoiseSuppression(): boolean;
    enableEchoCancellation(): boolean;
    enableAutoGainControl(): boolean;
    enableVadGate(): boolean;
    enableVenueNoiseMode(): boolean;

    setTalkMode(value: string): void;
    setTitleText(value: string): void;
    setEnableAutoGainControl(enabled: boolean): void;
    setEnableNoiseSuppression(enabled: boolean): void;
    setEnableEchoCancellation(enabled: boolean): void;
    setEnableVadGate(enabled: boolean): void;
    setEnableVenueNoiseMode(enabled: boolean): void;
    setEnableCharacter(enabled: boolean): void;
    setEnableTalk(enabled: boolean): void;
    setEnableCharacterGaze(enabled: boolean): void;
    setEnableAutoMute(enabled: boolean): void;
    setEnableInspector(enabled: boolean): void;
    setEnableVR(enabled: boolean): void;

    settingsUiState(): DialogSettingsUiState;
    settingsUiHints(): DialogSettingsUiHints;
    getDialogUiState(): DialogUiState;
    getVrmUiState(): DialogVrmUiState;

    subscribeSettingsChange(listener: () => void): () => void;
    subscribeDialogUiState(listener: (uiState: DialogUiState) => void): () => void;
    subscribeVrmUiState(listener: (uiState: DialogVrmUiState) => void): () => void;
};
