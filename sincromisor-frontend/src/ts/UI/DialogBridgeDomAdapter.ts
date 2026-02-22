// React 移行後に残る最小の DOM 依存（dialog 本体 / VRM file input / ヘッダー文言）を隔離する。
// DialogManager は state とルールに集中し、DOM 操作の詳細はこの adapter に閉じ込める。
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

    ensureDialogCloseInteractions(onRequestClose: () => void): void {
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
                // 背景クリックでは閉じない。操作は「はじめる」または「<< もどる」に限定する。
                e.preventDefault();
            }
        });
        // 現状の起動前設定では閉じ導線を明示操作（はじめる/もどる）に限定するため、callback は未使用。
        // 将来「確認付き close」を戻す場合の拡張点として引数は残している。
        void onRequestClose;
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

    setReactPrimarySettingsEnabled(enabled: boolean): void {
        this.getDialogElement().classList.toggle("reactPrimarySettingsEnabled", enabled);
    }

    setDialogDragoverClass(enabled: boolean): void {
        this.getDialogElement().classList.toggle("vrmDragover", enabled);
    }

    openVrmFilePicker(): void {
        const input = document.querySelector("input#vrmFileInput");
        if (input instanceof HTMLInputElement) {
            input.click();
        }
    }

    bindVrmFileInput(onFile: (file: File) => void): void {
        const input = document.querySelector("input#vrmFileInput");
        if (!(input instanceof HTMLInputElement)) {
            return;
        }
        input.addEventListener("change", (event) => {
            event.preventDefault();
            const target = event.target;
            if (!(target instanceof HTMLInputElement) || !target.files || target.files.length === 0) {
                return;
            }
            onFile(target.files[0]);
        });
    }

    bindDialogDragAndDrop(onDragOverChanged: (isDragOver: boolean) => void, onFile: (file: File) => void): void {
        // dialog 全体を drop target にし、React UI 側の表示状態は callback 経由で stateStore と同期する。
        const dialog = this.getDialogElement();
        dialog.addEventListener("dragover", (e) => {
            e.preventDefault();
            this.setDialogDragoverClass(true);
            onDragOverChanged(true);
        });
        dialog.addEventListener("dragleave", (e) => {
            e.preventDefault();
            this.setDialogDragoverClass(false);
            onDragOverChanged(false);
        });
        dialog.addEventListener("drop", (e) => {
            e.preventDefault();
            this.setDialogDragoverClass(false);
            onDragOverChanged(false);
            if (!e.dataTransfer || e.dataTransfer.files.length === 0) {
                return;
            }
            onFile(e.dataTransfer.files[0]);
        });
    }

    setHeaderTitle(text: string): void {
        const header = document.querySelector("div#sincroHeaderBox__text");
        if (header instanceof HTMLDivElement) {
            header.innerText = text;
        }
    }

}
