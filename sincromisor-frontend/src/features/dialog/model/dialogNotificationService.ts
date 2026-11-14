import { PopMessageService } from "./popMessageService";

// 起動前ダイアログと通常画面の通知表示をPopMessageServiceへ渡す。
// DialogManager から PopMessageService シングルトン取得を隠し、UI通知の責務を分離する。
export class DialogNotificationService {
    private readonly popMessageService = PopMessageService.getService();

    writeInfo(message: string): void {
        // DialogManager からは「info/error」の意図だけを渡し、PopMessageService API との差を吸収する。
        this.popMessageService.writeDialogPopMessage(message);
    }

    /** OBSの自動開始でダイアログが閉じても、既存の通常画面通知へ失敗を残す。 */
    writePageError(message: string): void {
        this.popMessageService.writePopError(message);
    }

    writeError(message: string): void {
        this.popMessageService.writeDialogPopError(message);
    }
}
