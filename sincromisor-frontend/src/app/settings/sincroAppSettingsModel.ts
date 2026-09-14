import type {
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../controller/sincroAppTypes";
import { clampAndRoundToStep } from "./sincroAppSettingsApply";
import { SincroAppSettingsChangeBatcher } from "./sincroAppSettingsChangeBatcher";
import type { SincroAppSettingKey, SincroAppSettings } from "./sincroAppSettingsDefaults";
import { sincroAppNumericSettingConstraints } from "./sincroAppSettingsDefaults";
import { SincroAppSettingsMediaDevices } from "./sincroAppSettingsMediaDevices";
import { SincroAppSettingsPolicy } from "./sincroAppSettingsPolicy";
import { SincroAppSettingsValues } from "./sincroAppSettingsValues";

/** ページ内の通常設定の正本。ダイアログや保存APIを生成せず、適用後の値と利用者編集を通知する。 */
export class SincroAppSettingsModel {
    private static shared?: SincroAppSettingsModel;
    private readonly stateStore = new SincroAppSettingsValues();
    private readonly settingsPolicy = new SincroAppSettingsPolicy();
    private readonly mediaDevices = new SincroAppSettingsMediaDevices(this.stateStore);
    private readonly settingsChangeListeners = new Set<() => void>();
    private readonly settingsEditListeners = new Set<
        (partial: Partial<SincroAppSettings>) => void
    >();
    private readonly settingsChangeBatcher = new SincroAppSettingsChangeBatcher(() => {
        for (const listener of this.settingsChangeListeners) listener();
    });

    /** アプリの組み立てと独立した読み取りで、同じページ内の設定を共有する。 */
    static getShared(): SincroAppSettingsModel {
        SincroAppSettingsModel.shared ??= new SincroAppSettingsModel();
        return SincroAppSettingsModel.shared;
    }

    /** 機器変化の購読を有効アプリへ返す。モデル生成だけでは機器の取得を開始しない。 */
    connectMediaDevices(): () => void {
        return this.mediaDevices.start(() => this.settingsChangeBatcher.emit());
    }

    /** 選択機器と適用済み設定から、ダイアログへ渡す開始可否を導出する。 */
    getStartButtonState() {
        return this.settingsPolicy.buildStartButtonState(
            this.stateStore,
            this.mediaDevices.buildUiContext(),
        );
    }

    /** 設定の正本をキーに対応する型で読み取る。 */
    getSetting<K extends SincroAppSettingKey>(key: K): SincroAppSettings[K] {
        return this.stateStore.get(key);
    }

    /** 起動前ダイアログと開始後設定パネルへ同じ設定のコピーを返す。 */
    getSettings(): SincroAppSettings {
        return this.stateStore.getSettings();
    }

    /**
     * 操作可能な設定をまとめて反映する。空の題名を補正し、機器選択の表示状態を更新してから一度通知する。
     * 通常数値も正規化する。会話モードの動作反映はアプリの設定適用処理が担う。
     */
    updateSettings(partial: Partial<SincroAppSettings>, source: "user" | "restore" = "user"): void {
        // 視線を先に確定し、更新後の依存条件で自動ミュートを受け付ける。
        // 入力の列挙順や直前の操作可否に結果を依存させない。
        const normalized = { ...partial };
        for (const key of [
            "characterMotionScale",
            "sincroPoseRetargetScale",
            "characterEyeTrackingScale",
        ] as const) {
            const value = partial[key];
            if (value !== undefined && source === "user") {
                const { min, max, step } = sincroAppNumericSettingConstraints[key];
                normalized[key] = clampAndRoundToStep(value, min, max, step);
            }
        }
        const { enableCharacterGaze, ...remaining } = normalized;
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
    subscribeSettingsEdit(listener: (partial: Partial<SincroAppSettings>) => void): () => void {
        this.settingsEditListeners.add(listener);
        return () => this.settingsEditListeners.delete(listener);
    }

    /** 設定反映後に通知する。返された関数で購読を解除する。 */
    subscribeSettingsChange(listener: () => void): () => void {
        this.settingsChangeListeners.add(listener);
        return () => this.settingsChangeListeners.delete(listener);
    }

    /** 適用済みの操作制限を通常設定UIへ返す。 */
    settingsUiState(): SincroAppSettingsUiState {
        return this.settingsPolicy.buildUiState(this.stateStore);
    }

    /** 現在の設定と機器一覧から利用不可の理由を返す。 */
    settingsUiHints(): SincroAppSettingsUiHints {
        return this.settingsPolicy.buildUiHints(
            this.stateStore,
            this.mediaDevices.buildUiContext(),
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
        this.mediaDevices.setUserMediaAvailability(available);
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
            available && this.mediaDevices.buildUiContext().isUserMediaAvailable,
        );
        this.settingsPolicy.applyAutoMuteAvailability(this.stateStore);
        this.settingsChangeBatcher.emit();
    }
}

/** 設定の適用・スナップショット組み立てが利用する操作。表示や保存の所有権は含めない。 */
export type SincroAppSettingsAccess = Pick<
    SincroAppSettingsModel,
    "getSetting" | "getSettings" | "updateSettings" | "settingsUiState" | "settingsUiHints"
>;
