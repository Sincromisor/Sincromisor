import type { DialogUiStateValue, DialogVrmUiStateValue } from "./dialogStateStore";

// DialogManager の購読/通知責務を分離する軽量 event hub。
// 状態の正本は DialogStateStore に置き、ここは listener 管理だけを担当する。
export class DialogEventHub {
    private readonly settingsChangeListeners = new Set<() => void>();
    private readonly vrmUiStateListeners = new Set<(state: DialogVrmUiStateValue) => void>();
    private readonly dialogUiStateListeners = new Set<(state: DialogUiStateValue) => void>();

    /** 設定の反映完了を購読する。返された関数で購読を解除する。 */
    subscribeSettingsChange(listener: () => void): () => void {
        this.settingsChangeListeners.add(listener);
        return () => {
            this.settingsChangeListeners.delete(listener);
        };
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

    /** 管理処理が状態と派生表示を更新した後で購読者へ同期通知する。 */
    emitSettingsChanged(): void {
        for (const listener of this.settingsChangeListeners) {
            listener();
        }
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
