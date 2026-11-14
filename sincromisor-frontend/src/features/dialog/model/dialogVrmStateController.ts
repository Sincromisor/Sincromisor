import { frontendLogger } from "../../../shared/logging/appLogger";
import type { DialogEventHub } from "./dialogEventHub";
import { DialogNotificationService } from "./dialogNotificationService";
import type { DialogStateStore } from "./dialogStateStore";
import { DialogVrmFileService } from "./dialogVrmFileService";
import { DialogVrmWorkflowService } from "./dialogVrmWorkflowService";

/** VRMの復元・選択確定とURL所有を担い、表示状態をダイアログへ通知する。 */
export class DialogVrmStateController {
    private readonly vrmFileService = new DialogVrmFileService();
    private readonly vrmWorkflowService = new DialogVrmWorkflowService(this.vrmFileService);
    private readonly notificationService = new DialogNotificationService();

    /** 復元・保存の結果を共有する。開始要求の取消しでは、この処理自体を中断しない。 */
    private pendingSelection?: Promise<void>;
    /** 復元結果を一度だけ採用し、再要求で古い選択を再適用しない。 */
    private initialRestoration?: Promise<void>;
    /** この選択処理で生成したURLだけを所有し、選択と進行中の読込が手放すまで保持する。 */
    private readonly ownedUrls = new Set<string>();
    /** 同じURLの並行読込も個別に区別し、全利用の終端まで保持する。 */
    private readonly loadingSelections = new Set<{ url: string }>();

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
            this.selectBlob(result.vrmBlob);
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
        if (this.initialRestoration) return this.initialRestoration;
        this.pendingSelection = this.restoreSelection().finally(() => {
            this.pendingSelection = undefined;
            this.setPending(false);
        });
        this.initialRestoration = this.pendingSelection;
        return this.initialRestoration;
    }

    private async restoreSelection(): Promise<void> {
        try {
            const result = await this.vrmWorkflowService.loadInitialVrmSelection();
            if (result.vrmBlob !== undefined) this.selectBlob(result.vrmBlob);
            this.setStatusText(result.statusText);
            frontendLogger.info("VRM file loaded.");
        } catch (error) {
            // 復元失敗は開始不能にせず、既定モデルへ戻したことを画面とログへ残す。
            const message = "VRMの復元に失敗しました。既定のモデルで開始できます";
            this.setStatusText(message);
            this.notificationService.writePageError(message);
            frontendLogger.error("VRM file load failed.", { error });
        }
    }

    /** 読込ごとの利用を登録する。成功・失敗・取消しの終端で、戻り値を必ず呼ぶ。 */
    retainVrmUrl(url: string): () => void {
        const loading = { url };
        this.loadingSelections.add(loading);
        // GLTFLoaderが成功コールバックの例外を失敗コールバックへ渡しても二重解放しない。
        return () => {
            if (!this.loadingSelections.delete(loading)) return;
            this.releaseUnusedUrl(url);
        };
    }

    /** 確定したBlobだけをURL化し、旧選択は読込利用がなければここで解放する。 */
    private selectBlob(blob: Blob): void {
        const previous = this.stateStore.getSelectedVrmUrl();
        const url = URL.createObjectURL(blob);
        this.ownedUrls.add(url);
        this.stateStore.setSelectedVrmUrl(url);
        this.releaseUnusedUrl(previous);
    }

    private releaseUnusedUrl(url: string): void {
        if (url === this.stateStore.getSelectedVrmUrl()) return;
        if ([...this.loadingSelections].some((loading) => loading.url === url)) return;
        // 外部URLや解放済みURLをrevokeしない。GPU資源とCache StorageのBlobは別の所有者が扱う。
        if (this.ownedUrls.delete(url)) URL.revokeObjectURL(url);
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
