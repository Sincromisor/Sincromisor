import { frontendLogger } from "../../../shared/logging/appLogger";
import type { DialogEventHub } from "./dialogEventHub";
import { DialogNotificationService } from "./dialogNotificationService";
import type { DialogStateStore } from "./dialogStateStore";
import { DialogVrmFileService } from "./dialogVrmFileService";
import { DialogVrmWorkflowService } from "./dialogVrmWorkflowService";

// DialogManager から VRM 選択/保存/状態通知の流れを切り出す controller。
// DialogManager 側は public API の facade に集中し、VRM 結果文言と cache 操作はここで扱う。
export class DialogVrmStateController {
    private readonly vrmFileService = new DialogVrmFileService();
    private readonly vrmWorkflowService = new DialogVrmWorkflowService(this.vrmFileService);
    private readonly notificationService = new DialogNotificationService();

    /** 復元・保存の結果を共有する。開始要求の取消しでは、この処理自体を中断しない。 */
    private pendingSelection?: Promise<void>;

    constructor(
        private readonly stateStore: DialogStateStore,
        private readonly eventHub: DialogEventHub,
    ) {}

    /** 復元・保存が終わるまでの共有待機を返す。準備済みなら同期開始を妨げない。 */
    waitForSelection(): Promise<void> | undefined {
        return this.pendingSelection;
    }

    /** 復元・保存中の再選択は拒み、選択確定後にだけ開始へ進める。 */
    applySelectedVrmFile(file: File): void {
        if (this.stateStore.getDialogVrmUiState().isSelectionPending) return;
        // 同期購読から開始が要求されても、通知より先に確立した共有待機へ接続する。
        this.pendingSelection = Promise.resolve()
            .then(() => this.applySelection(file))
            .finally(() => {
                this.pendingSelection = undefined;
                this.setPending(false);
            });
        this.setPending(true);
        this.setStatusText("開始準備中: VRMファイルを保存しています");
        this.eventHub.emitVrmSelectionChange();
    }

    private async applySelection(file: File): Promise<void> {
        try {
            const result = await this.vrmWorkflowService.applySelectedVrmFile(file);
            if (!result.ok) {
                this.setStatusText(result.statusText);
                this.notificationService.writeError(result.popError);
                return;
            }
            this.stateStore.setSelectedVrmUrl(result.vrmUrl);
            this.setStatusText(result.statusText);
            this.notificationService.writeInfo(result.popMessage);
            frontendLogger.info("VRM file updated.", { size: file.size, type: file.type });
        } catch (error) {
            this.setStatusText("VRMファイルの更新に失敗しました。現在のモデルで開始できます");
            this.notificationService.writeError("VRMファイルの更新に失敗しました。");
            frontendLogger.error("VRM file update failed.", { error });
        }
    }

    /** キャッシュ復元の成功・失敗を確定し、利用者の選択変更としては通知しない。 */
    loadInitialVrmSelection(): Promise<void> {
        this.pendingSelection = this.restoreSelection().finally(() => {
            this.pendingSelection = undefined;
            this.setPending(false);
        });
        return this.pendingSelection;
    }

    private async restoreSelection(): Promise<void> {
        try {
            const result = await this.vrmWorkflowService.loadInitialVrmSelection();
            if (result.vrmUrl !== undefined) this.stateStore.setSelectedVrmUrl(result.vrmUrl);
            this.setStatusText(result.statusText);
            frontendLogger.info("VRM file loaded.");
        } catch (error) {
            // 復元失敗は開始不能にせず、既定モデルへ戻したことを画面とログへ残す。
            this.setStatusText("VRMの復元に失敗しました。既定のモデルで開始できます");
            frontendLogger.error("VRM file load failed.", { error });
        }
    }

    private setPending(pending: boolean): void {
        this.stateStore.setVrmSelectionPending(pending);
        this.emitCurrentState();
    }

    async saveThumbnailBlob(blob: Blob): Promise<void> {
        await this.vrmFileService.saveVrmThumbnailBlob(blob);
    }

    async loadThumbnailBlob(): Promise<Blob | undefined> {
        return this.vrmFileService.loadVrmThumbnailBlob();
    }

    async clearThumbnailCache(): Promise<void> {
        await this.vrmFileService.clearVrmThumbnailCache();
    }

    setDragOver(isDragOver: boolean): void {
        const current = this.stateStore.getDialogVrmUiState();
        if (isDragOver && current.isSelectionPending) return;
        if (current.isDragOver === isDragOver) {
            return;
        }
        this.stateStore.setDialogVrmDragOver(isDragOver);
        // dragover は React UI 側で描画するため、state 更新後に購読イベントだけを流す。
        this.emitCurrentState();
    }

    private setStatusText(vrmStatusText: string): void {
        const current = this.stateStore.getDialogVrmUiState();
        if (current.vrmStatusText === vrmStatusText) {
            return;
        }
        this.stateStore.setDialogVrmStatusText(vrmStatusText);
        // VRM status は Pop通知文言と合わせて短時間に更新されることがあるため、同値ガード後に単発通知する。
        this.emitCurrentState();
    }

    private emitCurrentState(): void {
        this.eventHub.emitCurrentVrmUiState(() => this.stateStore.getDialogVrmUiState());
    }
}
