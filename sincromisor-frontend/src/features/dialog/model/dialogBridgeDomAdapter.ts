// React 移行後に残る HTMLDialogElement の platform boundary を隔離する。
// selector 探索や UI state の所有は React/DialogManager 側へ寄せ、ここは native dialog API だけを扱う。
export class DialogBridgeDomAdapter {
    bindDialogCloseInteractions(dialog: HTMLDialogElement, onClosed: () => void): () => void {
        // 起動前設定 dialog は唯一の導線になりやすいため、Esc による暗黙 close を無効化する。
        const handleCancel = (event: Event): void => {
            event.preventDefault();
        };
        const handleKeydown = (event: KeyboardEvent): void => {
            if (event.key === "Escape") {
                // cancel イベントで防いでいるが、独自 keydown close も明示的に無効化する。
                event.preventDefault();
            }
        };
        const handleClick = (event: MouseEvent): void => {
            if (event.target === dialog) {
                // 背景クリックでは閉じない。操作は「開始する」または「トップへ戻る」に限定する。
                event.preventDefault();
            }
        };
        const handleClose = (): void => {
            // dialog.close() が別経路から呼ばれても、stateStore 側の open 状態を同期できるようにする。
            onClosed();
        };

        dialog.addEventListener("cancel", handleCancel);
        dialog.addEventListener("keydown", handleKeydown);
        dialog.addEventListener("click", handleClick);
        dialog.addEventListener("close", handleClose);

        return () => {
            dialog.removeEventListener("cancel", handleCancel);
            dialog.removeEventListener("keydown", handleKeydown);
            dialog.removeEventListener("click", handleClick);
            dialog.removeEventListener("close", handleClose);
        };
    }

    syncDialogOpenState(dialog: HTMLDialogElement, isOpen: boolean): boolean {
        if (isOpen) {
            if (dialog.open) {
                return false;
            }
            dialog.showModal();
            return true;
        }
        if (!dialog.open) {
            return false;
        }
        dialog.close();
        return true;
    }
}
