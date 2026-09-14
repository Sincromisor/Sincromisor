import type { DialogUiStateValue, DialogVrmUiStateValue } from "./dialogStateStore";

// DialogManager の購読/通知責務を分離する軽量 event hub。
// 状態の正本は DialogStateStore に置き、ここは listener 管理だけを担当する。
export class DialogEventHub {
    private readonly vrmUiStateListeners = new Set<(state: DialogVrmUiStateValue) => void>();
    private readonly dialogUiStateListeners = new Set<(state: DialogUiStateValue) => void>();

    private readonly vrmSelectionListeners = new Set<() => void>();

    /** 利用者のVRM選択開始だけを購読する。初期キャッシュ復元や表示文言の変更は含めない。 */
    subscribeVrmSelectionChange(listener: () => void): () => void {
        this.vrmSelectionListeners.add(listener);
        return () => {
            this.vrmSelectionListeners.delete(listener);
        };
    }

    /** 非同期のファイル処理より先に、現在の較正を選択変更として中断させる。 */
    emitVrmSelectionChange(): void {
        for (const listener of this.vrmSelectionListeners) listener();
    }

    subscribeVrmUiState(
        listener: (state: DialogVrmUiStateValue) => void,
        initialState: DialogVrmUiStateValue,
    ): () => void {
        this.vrmUiStateListeners.add(listener);
        // subscribe 直後に現在値を送って、React 側の初回描画で空表示を避ける。
        listener(initialState);
        return () => {
            this.vrmUiStateListeners.delete(listener);
        };
    }

    subscribeDialogUiState(
        listener: (state: DialogUiStateValue) => void,
        initialState: DialogUiStateValue,
    ): () => void {
        this.dialogUiStateListeners.add(listener);
        listener(initialState);
        return () => {
            this.dialogUiStateListeners.delete(listener);
        };
    }

    emitVrmUiStateChanged(state: DialogVrmUiStateValue): void {
        for (const listener of this.vrmUiStateListeners) {
            listener(state);
        }
    }

    // DialogManager 側に state snapshot 取得ロジックを散らしすぎないため、
    // EventHub 側でも「getter から現在値を取って通知する」形を用意している。
    emitCurrentVrmUiState(getState: () => DialogVrmUiStateValue): void {
        this.emitVrmUiStateChanged(getState());
    }

    emitDialogUiStateChanged(state: DialogUiStateValue): void {
        for (const listener of this.dialogUiStateListeners) {
            listener(state);
        }
    }

    emitCurrentDialogUiState(getState: () => DialogUiStateValue): void {
        // DialogManager 側で snapshot を毎回構築するコードを散らさないための helper。
        this.emitDialogUiStateChanged(getState());
    }
}
