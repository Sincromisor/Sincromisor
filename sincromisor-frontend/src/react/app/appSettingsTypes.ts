import type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/app/sincroAppTypes";

export type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
};

// React UI からの設定変更は AppController 経由に統一する。
// Dialog / Control Panel の両 UI で同じ署名を使い回し、設定フォーム実装の差分を減らす。
export type ApplySettingsFn = (partial: Partial<SincroAppSettingsSnapshot>) => void;
