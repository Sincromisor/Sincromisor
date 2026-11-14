import { SincroAppSettingsModel } from "../../../app/settings/sincroAppSettingsModel";
import { DialogEventHub } from "./dialogEventHub";
import {
    DialogStateStore,
    type DialogUiStateValue,
    type DialogVrmUiStateValue,
} from "./dialogStateStore";
import { DialogUiStateController } from "./dialogUiStateController";
import { DialogVrmStateController } from "./dialogVrmStateController";

export type DialogVrmUiState = DialogVrmUiStateValue;
export type DialogUiState = DialogUiStateValue;

/** 開閉・開始案内・VRM選択を仲介する。ダイアログ本体のブラウザー操作はReactが担う。 */
export class DialogManager {
    private static instance: DialogManager;
    private readonly stateStore = new DialogStateStore();
    private readonly eventHub = new DialogEventHub();
    private readonly dialogUiStateController = new DialogUiStateController(
        this.stateStore,
        this.eventHub,
    );
    private readonly vrmStateController = new DialogVrmStateController(
        this.stateStore,
        this.eventHub,
    );

    /** ページ内で共有するダイアログ管理を初回に生成する。 */
    static getManager(settings = SincroAppSettingsModel.getShared()): DialogManager {
        if (!DialogManager.instance) {
            DialogManager.instance = new DialogManager(settings);
        }
        return DialogManager.instance;
    }

    private constructor(settings: SincroAppSettingsModel) {
        // 通常設定の所有者から開始案内だけを受け取り、表示とVRM復元を始める。
        const refreshStartButton = () => {
            const state = settings.getStartButtonState();
            const pending = this.stateStore.getDialogVrmUiState().isSelectionPending;
            this.dialogUiStateController.setStartButtonState(
                pending || state.startButtonDisabled,
                pending ? "開始準備中…" : state.startButtonText,
                pending ? "VRMの復元・保存が終わるまでお待ちください" : state.startButtonHint,
            );
        };
        // 設定モデルとダイアログはページ内で共有し、この購読もページの寿命まで保持する。
        settings.subscribeSettingsChange(refreshStartButton);
        refreshStartButton();
        this.showDialog();
        this.eventHub.subscribeVrmUiState(
            refreshStartButton,
            this.stateStore.getDialogVrmUiState(),
        );
        void this.vrmStateController.loadInitialVrmSelection();
    }

    /** ダイアログを開く状態を通知する。ブラウザー上の表示操作はReactが担う。 */
    showDialog(): void {
        // native dialog API 呼び出しは React 側 platform adapter が担当し、
        // ここでは state の正本だけを更新する。
        this.dialogUiStateController.setOpen(true);
    }

    /** ダイアログを閉じる状態をReactへ通知する。 */
    closeDialog(): void {
        this.dialogUiStateController.setOpen(false);
    }

    /** Reactで選択されたVRMファイルを適用し、選択状態を通知する。 */
    applySelectedVrmFile(file: File): void {
        this.vrmStateController.applySelectedVrmFile(file);
    }

    /** ドラッグ中の状態を保持し、表示更新をReactへ通知する。 */
    setVrmDragOver(isDragOver: boolean): void {
        this.vrmStateController.setDragOver(isDragOver);
    }

    /** 現在選択中のVRMをシーンへ渡すためのURLを返す。 */
    getSelectedVrmUrl(): string {
        return this.stateStore.getSelectedVrmUrl();
    }

    /** 利用者のVRM選択開始を購読する。初期復元や状態文言の変更では通知しない。 */
    subscribeVrmSelectionChange(listener: () => void): () => void {
        return this.eventHub.subscribeVrmSelectionChange(listener);
    }

    /** VRM選択の現在状態を即時通知し、以後の変更を購読する。 */
    subscribeVrmUiState(listener: (state: DialogVrmUiState) => void): () => void {
        return this.eventHub.subscribeVrmUiState(listener, this.stateStore.getDialogVrmUiState());
    }

    /** 表示と開始案内を即時通知し、以後の変更を購読する。 */
    subscribeDialogUiState(listener: (state: DialogUiState) => void): () => void {
        return this.eventHub.subscribeDialogUiState(listener, this.stateStore.getDialogUiState());
    }

    /** 表示と開始案内のコピーをアプリの初期通知へ渡す。 */
    getDialogUiState(): DialogUiState {
        return this.stateStore.getDialogUiState();
    }

    /** 選択したVRMの表示状態をアプリの初期通知へ渡す。 */
    getVrmUiState(): DialogVrmUiState {
        return this.stateStore.getDialogVrmUiState();
    }

    /** 復元・保存の確定を待つ。開始や取消しの副作用はアプリ側が所有する。 */
    waitForVrmSelection(): Promise<void> | undefined {
        const pending = this.vrmStateController.waitForSelection();
        // 復元完了通知から新しい保存が始まった場合も、その選択の確定まで待つ。
        return pending?.then(() => this.waitForVrmSelection());
    }

    /** 変換済みサムネイル画像を保存する。保存失敗は呼び出し元へ伝播する。 */
    async saveVrmThumbnailBlob(blob: Blob): Promise<void> {
        await this.vrmStateController.saveThumbnailBlob(blob);
    }

    /** 起動時に前回のサムネイルを取得する。未保存ならundefinedを返す。 */
    async loadVrmThumbnailBlob(): Promise<Blob | undefined> {
        return this.vrmStateController.loadThumbnailBlob();
    }

    // モデル更新時にキャッシュ不整合を防ぐための明示削除。
    async clearVrmThumbnailCache(): Promise<void> {
        await this.vrmStateController.clearThumbnailCache();
    }
}
