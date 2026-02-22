import type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
} from "../../ts/App/SincroAppTypes";

export type { SincroAppSettingsSnapshot };
export type { SincroAppSettingsUiState };
export type { SincroAppSettingsUiHints };

// React UI からの設定変更は AppController 経由に統一する。
export type ApplySettingsFn = (partial: Partial<SincroAppSettingsSnapshot>) => void;
