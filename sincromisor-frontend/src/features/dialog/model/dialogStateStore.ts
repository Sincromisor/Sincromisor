// React dialog 側で直接使う UI 状態（表示/開始ボタン）を store 側でも保持する。
export type DialogUiStateValue = {
    isOpen: boolean;
    startButtonDisabled: boolean;
    startButtonText: string;
    startButtonHint?: string;
};

export type DialogVrmUiStateValue = {
    isDragOver: boolean;
    /** 復元・保存中は選択を受け付けず、開始も確定結果を待つ。 */
    isSelectionPending: boolean;
    vrmStatusText: string;
};

/** ダイアログの表示とVRM選択だけを保持する。通常設定はアプリ層が所有する。 */
export class DialogStateStore {
    private dialogUiState: DialogUiStateValue = {
        isOpen: false,
        startButtonDisabled: false,
        startButtonText: "開始する",
    };
    private dialogVrmUiState: DialogVrmUiStateValue = {
        isDragOver: false,
        isSelectionPending: true,
        vrmStatusText: "開始準備中: 前回のVRMを復元しています",
    };
    private selectedVrmUrl: string = "/characters/default.vrm";

    getDialogUiState(): DialogUiStateValue {
        // 外部からの破壊的変更を避けるため snapshot を返す。
        return { ...this.dialogUiState };
    }

    setDialogOpen(isOpen: boolean): void {
        this.dialogUiState = { ...this.dialogUiState, isOpen };
    }

    setDialogStartButtonState(
        startButtonDisabled: boolean,
        startButtonText: string,
        startButtonHint?: string,
    ): void {
        this.dialogUiState = {
            ...this.dialogUiState,
            startButtonDisabled,
            startButtonText,
            startButtonHint,
        };
    }

    getDialogVrmUiState(): DialogVrmUiStateValue {
        return { ...this.dialogVrmUiState };
    }

    /** 選択処理だけが準備状態を変更し、表示側は復元・保存完了まで操作を無効にする。 */
    setVrmSelectionPending(isSelectionPending: boolean): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, isSelectionPending };
    }

    setDialogVrmDragOver(isDragOver: boolean): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, isDragOver };
    }

    setDialogVrmStatusText(vrmStatusText: string): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, vrmStatusText };
    }

    getSelectedVrmUrl(): string {
        return this.selectedVrmUrl;
    }

    setSelectedVrmUrl(vrmUrl: string): void {
        this.selectedVrmUrl = vrmUrl;
    }
}
