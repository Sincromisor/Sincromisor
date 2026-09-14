import type { DialogBackedSincroAppSettings } from "../../../app/settings/sincroAppSettingsDefaults";
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
    /** 初期化・利用不可通知と区別し、利用者が指定した適用済み項目を保存側へ渡す。 */
    private readonly settingsEditListeners = new Set<
        (partial: Partial<DialogBackedSincroAppSettings>) => void
    >();
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
        // 設定初期化 -> 機器購読 -> ダイアログ表示 -> 前回VRM復元 の順で起動する。
        this.initializeDialogStateDefaults();
        this.mediaDeviceUiController.start();
        this.showDialog();
        this.loadVrmFile()
            .then(() => {
                frontendLogger.info("VRM file loaded.");
            })
            .catch((error) => {
                frontendLogger.error("VRM file load failed.", { error });
            });
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

    /** 設定の正本をキーに対応する型で読み取る。 */
    getSetting<K extends DialogSettingKey>(key: K): DialogBackedSincroAppSettings[K] {
        return this.stateStore.get(key);
    }

    /** 起動前ダイアログと開始後設定パネルへ同じ設定のコピーを返す。 */
    getSettings(): DialogBackedSincroAppSettings {
        return this.stateStore.getSettings();
    }

    /**
     * 操作可能な設定をまとめて反映する。空の題名を補正し、機器選択の表示状態を更新してから一度通知する。
     * 数値入力の正規化と会話モードの動作反映はアプリの設定適用処理が担う。
     */
    updateSettings(
        partial: Partial<DialogBackedSincroAppSettings>,
        source: "user" | "restore" = "user",
    ): void {
        // 視線を先に確定し、更新後の依存条件で自動ミュートを受け付ける。
        // 入力の列挙順や直前の操作可否に結果を依存させない。
        const { enableCharacterGaze, ...remaining } = partial;
        const gazeApplied = this.stateStore.updateSettings({ enableCharacterGaze });
        this.settingsPolicy.applyAutoMuteAvailability(this.stateStore);
        const applied = { ...gazeApplied, ...this.stateStore.updateSettings(remaining) };
        if (Object.keys(applied).length === 0) {
            return;
        }
        if (applied.titleText !== undefined) {
            this.stateStore.set(
                "titleText",
                applied.titleText === "" ? "Sincromisor" : applied.titleText,
            );
        }
        if (
            "audioInputDeviceId" in applied ||
            "videoInputDeviceId" in applied ||
            applied.enableCharacterGaze !== undefined
        ) {
            this.mediaDeviceUiController.refreshDerivedUiState();
        }
        this.settingsChangeBatcher.emit();
        if (source === "user") {
            const current = this.getSettings();
            const edited = Object.fromEntries(
                Object.entries(current).filter(([key]) => key in applied),
            );
            // 視線オフに付随する自動ミュート解除も、同じ利用者操作として保存する。
            if (applied.enableCharacterGaze === false) edited.enableAutoMute = false;
            for (const listener of this.settingsEditListeners) listener(edited);
        }
    }

    /** 利用者操作だけを購読する。同値の明示入力も通知し、復元・利用不可による更新は除外する。 */
    subscribeSettingsEdit(
        listener: (partial: Partial<DialogBackedSincroAppSettings>) => void,
    ): () => void {
        this.settingsEditListeners.add(listener);
        return () => this.settingsEditListeners.delete(listener);
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

    /** キャラクターの利用可否に伴う設定と操作可否を更新し、一度通知する。 */
    updateCharacterStatus(available: boolean): void {
        this.settingsChangeBatcher.run(() => {
            this.updateEnableCharacterStatus(available);
            this.updateEnableCharacterGazeStatus(available);
            // disabled/checked 状態の変化も React 側へ同期する。
            this.settingsChangeBatcher.emit();
        });
    }

    /** メディアの利用可否に応じて設定と開始操作を更新し、一度通知する。 */
    updateUserMediaAvailabilityStatus(available: boolean): void {
        this.mediaDeviceUiController.setUserMediaAvailability(available);
        this.settingsChangeBatcher.run(() => {
            this.updateEnableCharacterGazeStatus(!this.stateStore.isDisabled("enableCharacter"));
            // getUserMedia 可否に連動した設定項目の disabled 変化を通知する。
            this.settingsChangeBatcher.emit();
        });
    }

    private updateEnableCharacterStatus(available: boolean) {
        this.settingsPolicy.applyCharacterAvailability(this.stateStore, available);
    }

    /** ページと端末の両方が利用可能な場合だけ視線を操作可能にし、依存値確定後に通知する。 */
    private updateEnableCharacterGazeStatus(available: boolean): void {
        this.settingsPolicy.applyCharacterGazeAvailability(
            this.stateStore,
            available && this.mediaDeviceUiController.buildUiContext().isUserMediaAvailable,
        );
        this.settingsPolicy.applyAutoMuteAvailability(this.stateStore);
        this.mediaDeviceUiController.refreshDerivedUiState();
        this.settingsChangeBatcher.emit();
    }

    private initializeDialogStateDefaults(): void {
        this.settingsPolicy.initializeDefaultDisabledState(this.stateStore);
        this.mediaDeviceUiController.refreshDerivedUiState();
    }

    private async loadVrmFile(): Promise<void> {
        await this.vrmStateController.loadInitialVrmSelection();
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
