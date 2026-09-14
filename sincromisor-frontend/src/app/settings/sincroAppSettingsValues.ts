import {
    createDefaultSincroAppSettings,
    defaultSincroAppSettingsDisabledState,
    type SincroAppSettingKey,
    type SincroAppSettings,
} from "./sincroAppSettingsDefaults";

/** 通常設定の値と操作可否。適用と通知は設定モデルが組み立てる。 */
export class SincroAppSettingsValues {
    private values: SincroAppSettings = createDefaultSincroAppSettings();
    private disabled: Record<SincroAppSettingKey, boolean> = {
        ...defaultSincroAppSettingsDisabledState,
    };
    /** 管理処理と表示規則が共有する設定値を、キーに対応する型で返す。 */
    get<K extends SincroAppSettingKey>(key: K): SincroAppSettings[K] {
        return this.values[key];
    }

    /** 利用可否の規則による強制更新用。利用者の入力はupdateSettingsで操作可否を確認する。 */
    set<K extends SincroAppSettingKey>(key: K, value: SincroAppSettings[K]): void {
        // store は純粋な状態保持に徹し、通知は設定モデルで行う。
        this.values[key] = value;
    }

    /** UIへの受け渡し用に設定全体のコピーを返す。 */
    getSettings(): SincroAppSettings {
        return { ...this.values };
    }

    /**
     * 型付きの内部入力から操作可能な設定だけを更新し、適用内容を返す。通知は管理処理が担う。
     * 機器IDのundefinedは既定機器への復帰、それ以外のundefinedは未指定として扱う。
     * アプリ全体の設定が渡されても、Looking Glassなど別の所有者の値は保持しない。
     */
    updateSettings(partial: Partial<SincroAppSettings>): Partial<SincroAppSettings> {
        const editableKeys = new Set(
            Object.entries(this.disabled)
                .filter(([, disabled]) => !disabled)
                .map(([key]) => key),
        );
        const applied: Partial<SincroAppSettings> = Object.fromEntries(
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
    isDisabled(key: SincroAppSettingKey): boolean {
        return this.disabled[key];
    }

    /** 機器・キャラクターの利用可否に応じて操作制限を更新する。 */
    setDisabled(key: SincroAppSettingKey, disabled: boolean): void {
        this.disabled[key] = disabled;
    }
}
