// 複数の dialog 設定更新を 1 回の settingsChange 通知にまとめる小さな batcher。
// DialogManager 本体から depth/pending 管理を切り離し、状態変更の意図を読みやすくする。
export class DialogSettingsChangeBatcher {
    private depth = 0;
    private pending = false;

    constructor(private readonly emitNow: () => void) {}

    emit(): void {
        if (this.depth > 0) {
            // 状態更新の途中では即時 emit せず、batch 終了時に 1 回だけ通知する。
            this.pending = true;
            return;
        }
        this.emitNow();
    }

    run(action: () => void): void {
        this.depth += 1;
        try {
            action();
        } finally {
            this.depth -= 1;
            if (this.depth === 0 && this.pending) {
                this.pending = false;
                this.emitNow();
            }
        }
    }
}
