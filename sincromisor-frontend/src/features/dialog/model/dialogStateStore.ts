import {
    createDefaultDialogBackedSettings,
    type DialogBackedSincroAppSettingKey,
    type DialogBackedSincroAppSettings,
    defaultDialogSettingsDisabledState,
} from "../../../app/settings/sincroAppSettingsDefaults";

export type DialogSettingKey = DialogBackedSincroAppSettingKey;

// React dialog 側で直接使う UI 状態（表示/開始ボタン）を store 側でも保持する。
export type DialogUiStateValue = {
    isOpen: boolean;
    startButtonDisabled: boolean;
    startButtonText: string;
    startButtonHint?: string;
};

export type DialogVrmUiStateValue = {
    isDragOver: boolean;
    vrmStatusText: string;
};

/** ダイアログ設定と表示状態を保持する。DOM同期と変更通知はDialogManagerへ委ねる。 */
export class DialogStateStore {
    private values: DialogBackedSincroAppSettings = createDefaultDialogBackedSettings();
    private disabled: Record<DialogSettingKey, boolean> = { ...defaultDialogSettingsDisabledState };
    private dialogUiState: DialogUiStateValue = {
        isOpen: false,
        startButtonDisabled: false,
        startButtonText: "開始する",
    };
    private dialogVrmUiState: DialogVrmUiStateValue = {
        isDragOver: false,
        vrmStatusText: "既定のVRMモデルを使用中",
    };
    private selectedVrmUrl: string = "/characters/default.vrm";

    /** 管理処理と表示規則が共有する設定値を、キーに対応する型で返す。 */
    get<K extends DialogSettingKey>(key: K): DialogBackedSincroAppSettings[K] {
        return this.values[key];
    }

    /** 利用可否の規則による強制更新用。利用者の入力はupdateSettingsで操作可否を確認する。 */
    set<K extends DialogSettingKey>(key: K, value: DialogBackedSincroAppSettings[K]): void {
        // store は純粋な状態保持に徹し、通知は DialogManager/EventHub 側で行う。
        this.values[key] = value;
    }

    /** UIへの受け渡し用に設定全体のコピーを返す。 */
    getSettings(): DialogBackedSincroAppSettings {
        return { ...this.values };
    }

    /**
     * 型付きの内部入力から操作可能な設定だけを更新し、適用内容を返す。通知は管理処理が担う。
     * 機器IDのundefinedは既定機器への復帰、それ以外のundefinedは未指定として扱う。
     * アプリ全体の設定が渡されても、Looking Glassなど別の所有者の値は保持しない。
     */
    updateSettings(
        partial: Partial<DialogBackedSincroAppSettings>,
    ): Partial<DialogBackedSincroAppSettings> {
        const editableKeys = new Set(
            Object.entries(this.disabled)
                .filter(([, disabled]) => !disabled)
                .map(([key]) => key),
        );
        const applied: Partial<DialogBackedSincroAppSettings> = Object.fromEntries(
            Object.entries(partial).filter(
                ([key, value]) =>
                    editableKeys.has(key) &&
                    (value !== undefined ||
                        key === "audioInputDeviceId" ||
                        key === "videoInputDeviceId"),
            ),
        );
        Object.assign(this.values, applied);
        return applied;
    }

    /** 設定UIからの変更を受け付けない項目かを返す。 */
    isDisabled(key: DialogSettingKey): boolean {
        return this.disabled[key];
    }

    /** 機器・キャラクターの利用可否に応じて操作制限を更新する。 */
    setDisabled(key: DialogSettingKey, disabled: boolean): void {
        this.disabled[key] = disabled;
    }

    getDialogUiState(): DialogUiStateValue {
        // 外部からの破壊的変更を避けるため snapshot を返す。
        return { ...this.dialogUiState };
    }

    setDialogOpen(isOpen: boolean): void {
        this.dialogUiState = { ...this.dialogUiState, isOpen };
    }

    setDialogStartButtonState(
        startButtonDisabled: boolean,
        startButtonText: string,
        startButtonHint?: string,
    ): void {
        this.dialogUiState = {
            ...this.dialogUiState,
            startButtonDisabled,
            startButtonText,
            startButtonHint,
        };
    }

    getDialogVrmUiState(): DialogVrmUiStateValue {
        return { ...this.dialogVrmUiState };
    }

    setDialogVrmDragOver(isDragOver: boolean): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, isDragOver };
    }

    setDialogVrmStatusText(vrmStatusText: string): void {
        this.dialogVrmUiState = { ...this.dialogVrmUiState, vrmStatusText };
    }

    getSelectedVrmUrl(): string {
        return this.selectedVrmUrl;
    }

    setSelectedVrmUrl(vrmUrl: string): void {
        this.selectedVrmUrl = vrmUrl;
    }
}
