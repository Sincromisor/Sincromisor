import { frontendLogger } from "../logging/appLogger";
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

    constructor(
        private readonly stateStore: DialogStateStore,
        private readonly eventHub: DialogEventHub,
    ) {}

    applySelectedVrmFile(file: File): void {
        this.vrmWorkflowService
            .applySelectedVrmFile(file)
            .then((result) => {
                if (!result.ok) {
                    this.setStatusText(result.statusText);
                    this.notificationService.writeError(result.popError);
                    return;
                }
                this.stateStore.setSelectedVrmUrl(result.vrmUrl);
                this.setStatusText(result.statusText);
                this.notificationService.writeInfo(result.popMessage);
                frontendLogger.info("VRM file updated.", {
                    size: file.size,
                    type: file.type,
                });
            })
            .catch((error) => {
                this.setStatusText("VRMファイルの更新に失敗しました");
                this.notificationService.writeError("VRMファイルの更新に失敗しました。");
                frontendLogger.error("VRM file update failed.", { error });
            });
    }

    async loadInitialVrmSelection(): Promise<void> {
        const result = await this.vrmWorkflowService.loadInitialVrmSelection();
        if (result.vrmUrl !== undefined) {
            this.stateStore.setSelectedVrmUrl(result.vrmUrl);
        }
        this.setStatusText(result.statusText);
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
