import type {
    DialogManager,
    DialogSettingsUiHints,
    DialogSettingsUiState,
    DialogUiState,
    DialogVrmUiState,
} from "../../features/dialog/model/dialogManager";

/** アプリの設定適用と橋渡しに必要な操作。設定の型はDialogManagerの契約を再利用する。 */
export type SincroAppDialogFacade = {
    applySelectedVrmFile(file: File): void;
    setVrmDragOver(isDragOver: boolean): void;
    closeDialog(): void;
    showDialog(): void;
    updateUserMediaAvailabilityStatus(available: boolean): void;
    updateCharacterStatus(available: boolean): void;
    loadVrmThumbnailBlob(): Promise<Blob | undefined>;
    saveVrmThumbnailBlob(blob: Blob): Promise<void>;
    getSelectedVrmUrl(): string;

    getSetting: DialogManager["getSetting"];
    getSettings: DialogManager["getSettings"];
    updateSettings: DialogManager["updateSettings"];

    settingsUiState(): DialogSettingsUiState;
    settingsUiHints(): DialogSettingsUiHints;
    getDialogUiState(): DialogUiState;
    getVrmUiState(): DialogVrmUiState;

    subscribeSettingsChange(listener: () => void): () => void;
    subscribeDialogUiState(listener: (uiState: DialogUiState) => void): () => void;
    subscribeVrmUiState(listener: (uiState: DialogVrmUiState) => void): () => void;
};
