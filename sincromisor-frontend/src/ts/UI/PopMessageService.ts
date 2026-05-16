export class PopMessageService {
    private popBox: HTMLDivElement;
    private static instance: PopMessageService;
    private messageQueue: HTMLDivElement[] = [];
    private readonly MAX_MESSAGES = 3;
    private readonly AUTO_REMOVE_TIME = 10000;
    private dialogPopListeners = new Set<(event: DialogPopEvent) => void>();
    private dialogPopMessageID: number = 0;

    static getService(): PopMessageService {
        if (!PopMessageService.instance) {
            PopMessageService.instance = new PopMessageService();
        }
        return PopMessageService.instance;
    }

    subscribeDialogPop(listener: (event: DialogPopEvent) => void): () => void {
        this.dialogPopListeners.add(listener);
        return () => {
            this.dialogPopListeners.delete(listener);
        };
    }

    // 通常画面用 pop は既存 DOM 描画を継続し、dialog 内 pop は React event 描画を正式経路とする。
    private constructor() {
        this.popBox = document.querySelector("div#sincroPopBox")!;
    }

    /* 通常メッセージ */
    writePopMessage(message: string): void {
        this.writeMessage(message, false, this.popBox);
    }

    /* エラーメッセージ */
    writePopError(message: string): void {
        this.writeMessage(message, true, this.popBox);
    }

    /* モーダル設定ダイアログでの通常メッセージ */
    // dialog 内は React 描画が正式経路のため、DOM 生成は行わずイベント通知だけを流す。
    writeDialogPopMessage(message: string): void {
        this.emitDialogPop(message, false);
    }

    /* モーダル設定ダイアログでのエラーメッセージ */
    writeDialogPopError(message: string): void {
        this.emitDialogPop(message, true);
    }

    private writeMessage(message: string, error: boolean, targetBox: HTMLDivElement): void {
        const messageElement: HTMLDivElement = document.createElement("div");
        if (error) {
            messageElement.className = "popMessage popError";
        } else {
            messageElement.className = "popMessage";
        }
        messageElement.textContent = message;

        targetBox.appendChild(messageElement);
        this.messageQueue.push(messageElement);

        // 最大表示数を超えた場合、古いメッセージを削除
        if (this.messageQueue.length > this.MAX_MESSAGES) {
            const oldMessage = this.messageQueue.shift();
            if (oldMessage) {
                oldMessage.classList.remove("showPop");
                setTimeout(() => oldMessage.remove(), 500);
            }
        }

        // メッセージを表示
        setTimeout(() => messageElement.classList.add("showPop"), 10);

        // AUTO_REMOVE_TIME秒後に削除
        setTimeout(() => {
            messageElement.classList.remove("showPop");
            setTimeout(() => {
                messageElement.remove();
                this.messageQueue = this.messageQueue.filter((msg) => msg !== messageElement);
            }, 500);
        }, this.AUTO_REMOVE_TIME);
    }

    // React側のアニメーション制御用に ID と auto-remove 時間を付与して通知する。
    private emitDialogPop(message: string, error: boolean): void {
        const event: DialogPopEvent = {
            id: ++this.dialogPopMessageID,
            message,
            error,
            autoRemoveMs: this.AUTO_REMOVE_TIME,
        };
        this.dialogPopListeners.forEach((listener) => {
            listener(event);
        });
    }
}

export type DialogPopEvent = {
    id: number;
    message: string;
    error: boolean;
    autoRemoveMs: number;
};
