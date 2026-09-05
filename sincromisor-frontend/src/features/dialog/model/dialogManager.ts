import type { DialogBackedSincroAppSettings } from "../../../app/settings/sincroAppSettingsDefaults";
import { HeaderTitleDomAdapter } from "../../../app/shell/headerTitleDomAdapter";
import { frontendLogger } from "../../../shared/logging/appLogger";
import { DialogEventHub } from "./dialogEventHub";
import { DialogMediaDeviceUiController } from "./dialogMediaDeviceUiController";
import { DialogSettingsChangeBatcher } from "./dialogSettingsChangeBatcher";
import {
    DialogSettingsPolicy,
    type DialogSettingsUiHints,
    type DialogSettingsUiState,
} from "./dialogSettingsPolicy";
import {
    type DialogSettingKey,
    DialogStateStore,
    type DialogUiStateValue,
    type DialogVrmUiStateValue,
} from "./dialogStateStore";
import { DialogUiStateController } from "./dialogUiStateController";
import { DialogVrmStateController } from "./dialogVrmStateController";

export type { DialogSettingsUiHints, DialogSettingsUiState } from "./dialogSettingsPolicy";
export type DialogVrmUiState = DialogVrmUiStateValue;
export type DialogUiState = DialogUiStateValue;

/** 設定の正本と表示更新・通知を仲介する。ダイアログ本体のブラウザー操作はReactが担う。 */
export class DialogManager {
    private static instance: DialogManager;
    private readonly stateStore = new DialogStateStore();
    private readonly eventHub = new DialogEventHub();
    private readonly headerDom = new HeaderTitleDomAdapter();
    private readonly settingsPolicy = new DialogSettingsPolicy();
    private readonly settingsChangeBatcher = new DialogSettingsChangeBatcher(() => {
        this.eventHub.emitSettingsChanged();
    });
    private readonly dialogUiStateController = new DialogUiStateController(
        this.stateStore,
        this.eventHub,
    );
    private readonly mediaDeviceUiController = new DialogMediaDeviceUiController(
        this.stateStore,
        this.settingsPolicy,
        () => this.settingsChangeBatcher.emit(),
        (startButtonDisabled, startButtonText, startButtonHint) => {
            this.dialogUiStateController.setStartButtonState(
                startButtonDisabled,
                startButtonText,
                startButtonHint,
            );
        },
    );
    private readonly vrmStateController = new DialogVrmStateController(
        this.stateStore,
        this.eventHub,
    );

    /** ページ内で共有する設定管理を初回に生成する。 */
    static getManager(): DialogManager {
        if (!DialogManager.instance) {
            DialogManager.instance = new DialogManager();
        }
        return DialogManager.instance;
    }

    private constructor() {
        // store 初期化 -> DOMイベント配線 -> ヘッダー同期 -> dialog 表示 -> 前回VRM復元 の順で起動する。
        this.initializeDialogStateDefaults();
        this.mediaDeviceUiController.start();
        this.updateTitleText();
        this.showDialog();
        this.loadVrmFile()
            .then(() => {
                frontendLogger.info("VRM file loaded.");
            })
            .catch((error) => {
                frontendLogger.error("VRM file load failed.", { error });
            });
    }

    showDialog(): void {
        // native dialog API 呼び出しは React 側 platform adapter が担当し、
        // ここでは state の正本だけを更新する。
        this.dialogUiStateController.setOpen(true);
    }

    closeDialog(): void {
        this.dialogUiStateController.setOpen(false);
    }

    // React dialog から選択された VRM ファイルを正式経路として適用する。
    applySelectedVrmFile(file: File): void {
        this.vrmStateController.applySelectedVrmFile(file);
    }

    // dragover 表示は React が担当しつつ、状態の正本は DialogStateStore に残す。
    setVrmDragOver(isDragOver: boolean): void {
        this.vrmStateController.setDragOver(isDragOver);
    }

    getSelectedVrmUrl(): string {
        return this.stateStore.getSelectedVrmUrl();
    }

    /** 設定の正本をキーに対応する型で読み取る。 */
    getSetting<K extends DialogSettingKey>(key: K): DialogBackedSincroAppSettings[K] {
        return this.stateStore.get(key);
    }

    /** 起動前ダイアログと開始後設定パネルへ同じ設定のコピーを返す。 */
    getSettings(): DialogBackedSincroAppSettings {
        return this.stateStore.getSettings();
    }

    /**
     * 操作可能な設定をまとめて反映する。題名と機器選択の表示を更新してから一度通知する。
     * 数値入力の正規化と会話モードの動作反映はアプリの設定適用処理が担う。
     */
    updateSettings(partial: Partial<DialogBackedSincroAppSettings>): void {
        const applied = this.stateStore.updateSettings(partial);
        if (Object.keys(applied).length === 0) {
            return;
        }
        if (applied.titleText !== undefined) {
            this.stateStore.set(
                "titleText",
                applied.titleText === "" ? "Sincromisor" : applied.titleText,
            );
            this.updateTitleText();
        }
        if (
            "audioInputDeviceId" in applied ||
            "videoInputDeviceId" in applied ||
            applied.enableCharacterGaze !== undefined
        ) {
            this.mediaDeviceUiController.refreshDerivedUiState();
        }
        this.settingsChangeBatcher.emit();
    }

    /** 設定反映後に通知する。返された関数で購読を解除する。 */
    subscribeSettingsChange(listener: () => void): () => void {
        return this.eventHub.subscribeSettingsChange(listener);
    }

    subscribeVrmUiState(listener: (state: DialogVrmUiState) => void): () => void {
        return this.eventHub.subscribeVrmUiState(listener, this.stateStore.getDialogVrmUiState());
    }

    subscribeDialogUiState(listener: (state: DialogUiState) => void): () => void {
        return this.eventHub.subscribeDialogUiState(listener, this.stateStore.getDialogUiState());
    }

    getDialogUiState(): DialogUiState {
        return this.stateStore.getDialogUiState();
    }

    getVrmUiState(): DialogVrmUiState {
        return this.stateStore.getDialogVrmUiState();
    }

    settingsUiState(): DialogSettingsUiState {
        return this.settingsPolicy.buildUiState(this.stateStore);
    }

    settingsUiHints(): DialogSettingsUiHints {
        return this.settingsPolicy.buildUiHints(
            this.stateStore,
            this.mediaDeviceUiController.buildUiContext(),
        );
    }

    /** 現在の題名をダイアログ外のヘッダーへ同期する。 */
    updateTitleText(): void {
        this.headerDom.setHeaderTitle(this.getSetting("titleText"));
    }

    updateCharacterStatus(available: boolean): void {
        this.settingsChangeBatcher.run(() => {
            this.updateEnableCharacterStatus(available);
            this.updateEnableCharacterGazeStatus(available);
            this.updateAutoMuteStatus();
            // disabled/checked 状態の変化も React 側へ同期する。
            this.settingsChangeBatcher.emit();
        });
    }

    updateUserMediaAvailabilityStatus(available: boolean): void {
        this.mediaDeviceUiController.setUserMediaAvailability(available);
        this.settingsChangeBatcher.run(() => {
            if (!available) {
                this.updateEnableCharacterGazeStatus(false);
                this.updateAutoMuteStatus();
            }
            this.mediaDeviceUiController.refreshDerivedUiState();
            // getUserMedia 可否に連動した設定項目の disabled 変化を通知する。
            this.settingsChangeBatcher.emit();
        });
    }

    private updateEnableCharacterStatus(available: boolean) {
        this.settingsPolicy.applyCharacterAvailability(this.stateStore, available);
    }

    updateEnableCharacterGazeStatus(available: boolean): void {
        this.settingsPolicy.applyCharacterGazeAvailability(this.stateStore, available);
        this.mediaDeviceUiController.refreshDerivedUiState();
        this.settingsChangeBatcher.emit();
    }

    updateAutoMuteStatus(): void {
        this.settingsPolicy.applyAutoMuteAvailability(this.stateStore);
        this.settingsChangeBatcher.emit();
    }

    private initializeDialogStateDefaults(): void {
        this.settingsPolicy.initializeDefaultDisabledState(this.stateStore);
        this.mediaDeviceUiController.refreshDerivedUiState();
    }

    private async loadVrmFile(): Promise<void> {
        await this.vrmStateController.loadInitialVrmSelection();
    }

    // 変換済みサムネイル画像(Blob)を保存する。
    async saveVrmThumbnailBlob(blob: Blob): Promise<void> {
        await this.vrmStateController.saveThumbnailBlob(blob);
    }

    // 起動時に前回使用したサムネイルを復元する。
    async loadVrmThumbnailBlob(): Promise<Blob | undefined> {
        return this.vrmStateController.loadThumbnailBlob();
    }

    // モデル更新時にキャッシュ不整合を防ぐための明示削除。
    async clearVrmThumbnailCache(): Promise<void> {
        await this.vrmStateController.clearThumbnailCache();
    }
}
