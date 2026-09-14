import type { DialogUiState, DialogVrmUiState } from "../../features/dialog/model/dialogManager";

/** アプリがダイアログの表示・VRM操作に使う窓口。通常設定は含めない。 */
export type SincroAppDialogFacade = {
    applySelectedVrmFile(file: File): void;
    setVrmDragOver(isDragOver: boolean): void;
    closeDialog(): void;
    showDialog(): void;
    loadVrmThumbnailBlob(): Promise<Blob | undefined>;
    saveVrmThumbnailBlob(blob: Blob): Promise<void>;
    getSelectedVrmUrl(): string;

    getDialogUiState(): DialogUiState;
    getVrmUiState(): DialogVrmUiState;

    subscribeDialogUiState(listener: (uiState: DialogUiState) => void): () => void;
    subscribeVrmUiState(listener: (uiState: DialogVrmUiState) => void): () => void;
};
