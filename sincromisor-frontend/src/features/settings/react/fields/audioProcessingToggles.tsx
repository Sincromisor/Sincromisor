import { SettingsToggle, SettingsToggleGrid } from "../primitives/settingsPrimitives";
import type { ToggleGroupProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

/** 音声補正を項目名とチェック状態で示し、適用結果の判定は音声モデルへ委ねる。 */
export function AudioProcessingToggles({
    settings,
    uiState,
    onApplySettings,
    gridDensity = "regular",
    toggleDensity = "regular",
}: ToggleGroupProps) {
    return (
        <SettingsToggleGrid density={gridDensity}>
            <SettingsToggle
                density={toggleDensity}
                label="マイクをミュートする"
                description="送信音声を止めます。接続と返却音声は維持します。"
                checked={settings.muteMicrophone}
                onChange={(checked) => onApplySettings({ muteMicrophone: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="ノイズを抑える"
                checked={!!settings.enableNoiseSuppression}
                disabled={uiState.enableNoiseSuppressionDisabled}
                onChange={(checked) => onApplySettings({ enableNoiseSuppression: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="音の回り込みを抑える"
                checked={!!settings.enableEchoCancellation}
                disabled={uiState.enableEchoCancellationDisabled}
                onChange={(checked) => onApplySettings({ enableEchoCancellation: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="音量を自動で整える"
                checked={!!settings.enableAutoGainControl}
                disabled={uiState.enableAutoGainControlDisabled}
                onChange={(checked) => onApplySettings({ enableAutoGainControl: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="無音時の送信を抑える"
                checked={!!settings.enableVadGate}
                disabled={uiState.enableVadGateDisabled}
                onChange={(checked) => onApplySettings({ enableVadGate: checked })}
            />
            <SettingsToggle
                density={toggleDensity}
                label="にぎやかな場所向けに調整"
                help={settingHelp.enableVenueNoiseMode}
                checked={!!settings.enableVenueNoiseMode}
                disabled={uiState.enableVenueNoiseModeDisabled}
                onChange={(checked) => onApplySettings({ enableVenueNoiseMode: checked })}
            />
        </SettingsToggleGrid>
    );
}
