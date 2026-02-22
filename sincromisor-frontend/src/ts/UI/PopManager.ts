export class PopManager {
    private popBox: HTMLDivElement;
    private dialogPopBox: HTMLDivElement;
    private static instance: PopManager;
    private messageQueue: HTMLDivElement[] = [];
    private readonly MAX_MESSAGES = 3;
    private readonly AUTO_REMOVE_TIME = 10000;
    private dialogPopDomRenderingEnabled: boolean = true;
    private dialogPopListeners = new Set<(event: DialogPopEvent) => void>();
    private dialogPopMessageID: number = 0;

    static getManager(): PopManager {
        if (!PopManager.instance) {
            PopManager.instance = new PopManager();
        }
        return PopManager.instance;
    }

    subscribeDialogPop(listener: (event: DialogPopEvent) => void): () => void {
        this.dialogPopListeners.add(listener);
        return () => {
            this.dialogPopListeners.delete(listener);
        };
    }

    setDialogPopDomRenderingEnabled(enabled: boolean): void {
        this.dialogPopDomRenderingEnabled = enabled;
        if (!enabled) {
            this.dialogPopBox.innerHTML = "";
        }
    }

    /*
        次のような制約のため、モーダルダイアログ用と通常用のポップアップボックスを分ける。
        * dialog要素外だとモーダルダイアログの上にoverlayできない。
        * dialog要素内だと、dialogを閉じた際に表示されなくなる。

        DialogManagerから呼び出す際は、モーダルダイアログ用のメソッドを使うこと。
    */
    private constructor() {
        this.popBox = document.querySelector('div#sincroPopBox')!;
        this.dialogPopBox = document.querySelector('div#sincroDialogPopBox')!;
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
    writeDialogPopMessage(message: string): void {
        this.writeMessage(message, false, this.dialogPopBox);
        this.emitDialogPop(message, false);
    }

    /* モーダル設定ダイアログでのエラーメッセージ */
    writeDialogPopError(message: string): void {
        this.writeMessage(message, true, this.dialogPopBox);
        this.emitDialogPop(message, true);
    }

    private writeMessage(message: string, error: boolean, targetBox: HTMLDivElement): void {
        if (targetBox === this.dialogPopBox && !this.dialogPopDomRenderingEnabled) {
            return;
        }
        const messageElement: HTMLDivElement = document.createElement('div');
        if (error) {
            messageElement.className = 'popMessage popError';
        } else {
            messageElement.className = 'popMessage';
        }
        messageElement.textContent = message;

        targetBox.appendChild(messageElement);
        this.messageQueue.push(messageElement);

        // 最大表示数を超えた場合、古いメッセージを削除
        if (this.messageQueue.length > this.MAX_MESSAGES) {
            const oldMessage = this.messageQueue.shift();
            if (oldMessage) {
                oldMessage.classList.remove('showPop');
                setTimeout(() => oldMessage.remove(), 500);
            }
        }

        // メッセージを表示
        setTimeout(() => messageElement.classList.add('showPop'), 10);

        // AUTO_REMOVE_TIME秒後に削除
        setTimeout(() => {
            messageElement.classList.remove('showPop');
            setTimeout(() => {
                messageElement.remove();
                this.messageQueue = this.messageQueue.filter(msg => msg !== messageElement);
            }, 500);
        }, this.AUTO_REMOVE_TIME);
    }

    private emitDialogPop(message: string, error: boolean): void {
        const event: DialogPopEvent = {
            id: ++this.dialogPopMessageID,
            message,
            error,
            autoRemoveMs: this.AUTO_REMOVE_TIME,
        };
        this.dialogPopListeners.forEach((listener) => listener(event));
    }
}

export type DialogPopEvent = {
    id: number;
    message: string;
    error: boolean;
    autoRemoveMs: number;
};
