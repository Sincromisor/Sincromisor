import type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiHints,
    SincroAppSettingsUiState,
    SincroAppStartupSettingsCapabilities,
    SincroAppStartupSettingsStatus,
} from "../../ts/App/SincroAppTypes";

export type { SincroAppSettingsSnapshot };
export type { SincroAppSettingsUiState };
export type { SincroAppSettingsUiHints };
export type { SincroAppStartupSettingsStatus };
export type { SincroAppStartupSettingsCapabilities };

// React UI からの設定変更は AppController 経由に統一する。
// Dialog / Control Panel の両 UI で同じ署名を使い回し、設定フォーム実装の差分を減らす。
export type ApplySettingsFn = (partial: Partial<SincroAppSettingsSnapshot>) => void;
