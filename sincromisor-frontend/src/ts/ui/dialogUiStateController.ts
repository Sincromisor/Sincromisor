import type { DialogEventHub } from "./dialogEventHub";
import type { DialogStateStore } from "./dialogStateStore";

// Dialog の開閉状態と開始ボタン状態を更新し、React 側へ現在 snapshot を通知する controller。
// 設定値そのものとは別イベントで流すことで、dialog 表示状態の更新順を安定させる。
export class DialogUiStateController {
    constructor(
        private readonly stateStore: DialogStateStore,
        private readonly eventHub: DialogEventHub,
    ) {}

    setOpen(isOpen: boolean): void {
        const current = this.stateStore.getDialogUiState();
        if (current.isOpen === isOpen) {
            return;
        }
        this.stateStore.setDialogOpen(isOpen);
        this.emitCurrentState();
    }

    setStartButtonState(
        startButtonDisabled: boolean,
        startButtonText: string,
        startButtonHint?: string,
    ): void {
        const current = this.stateStore.getDialogUiState();
        if (
            current.startButtonDisabled === startButtonDisabled &&
            current.startButtonText === startButtonText &&
            current.startButtonHint === startButtonHint
        ) {
            return;
        }
        this.stateStore.setDialogStartButtonState(
            startButtonDisabled,
            startButtonText,
            startButtonHint,
        );
        this.emitCurrentState();
    }

    private emitCurrentState(): void {
        this.eventHub.emitCurrentDialogUiState(() => this.stateStore.getDialogUiState());
    }
}
