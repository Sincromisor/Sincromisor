import { PopManager } from "./PopManager";

// 起動前 dialog 内の通知表示（PopManager 経由）をラップする。
// DialogManager から PopManager シングルトン取得を隠し、UI通知の責務を分離する。
export class DialogNotificationService {
    private readonly popManager = PopManager.getManager();

    writeInfo(message: string): void {
        this.popManager.writeDialogPopMessage(message);
    }

    writeError(message: string): void {
        this.popManager.writeDialogPopError(message);
    }
}
