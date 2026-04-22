// React 移行後に残る HTMLDialogElement の platform boundary を隔離する。
// DialogManager は dialog 状態とルールに集中し、native dialog API だけをここへ閉じ込める。
export class DialogBridgeDomAdapter {
    private dialogEventsBound = false;

    getDialogElement(): HTMLDialogElement {
        // dialog は singleton 前提で 1 つだけ存在する想定。未検出は構成崩れとして即エラーにする。
        const dialog = document.querySelector("dialog#configurationDialog");
        if (!(dialog instanceof HTMLDialogElement)) {
            throw new Error("dialog#configurationDialog is not found.");
        }
        return dialog;
    }

    ensureDialogCloseInteractions(onClosed: () => void): void {
        if (this.dialogEventsBound) {
            return;
        }
        const dialog = this.getDialogElement();
        // 起動前設定 dialog は唯一の導線になりやすいため、Esc による暗黙 close を無効化する。
        dialog.addEventListener("cancel", (e) => {
            e.preventDefault();
        });
        dialog.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                // cancel イベントで防いでいるが、独自 keydown close も明示的に無効化する。
                e.preventDefault();
            }
        });
        dialog.addEventListener("click", (e) => {
            if (e.target === dialog) {
                // 背景クリックでは閉じない。操作は「開始する」または「トップへ戻る」に限定する。
                e.preventDefault();
            }
        });
        dialog.addEventListener("close", () => {
            // dialog.close() が別経路から呼ばれても、stateStore 側の open 状態を同期できるようにする。
            onClosed();
        });
        this.dialogEventsBound = true;
    }

    showDialog(): boolean {
        const dialog = this.getDialogElement();
        if (dialog.open) {
            return false;
        }
        dialog.showModal();
        return true;
    }

    closeDialog(): boolean {
        const dialog = this.getDialogElement();
        if (!dialog.open) {
            return false;
        }
        dialog.close();
        return true;
    }

}
