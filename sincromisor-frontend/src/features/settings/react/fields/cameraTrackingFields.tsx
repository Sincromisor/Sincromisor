import { sincroAppNumericSettingConstraints } from "../../../../app/settings/sincroAppSettingsDefaults";
import {
    SettingsFieldStack,
    SettingsHint,
    SettingsRange,
    SettingsToggle,
    SettingsToggleGrid,
} from "../primitives/settingsPrimitives";
import type { ToggleGroupProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

type CharacterDisplayTogglesProps = ToggleGroupProps & {
    uiHints: {
        enableCharacterReason?: string;
        enableCharacterGazeReason?: string;
        enableAutoMuteReason?: string;
    };
};
/** カメラ追跡と同期量を表示する。表示・追跡の依存条件と保存値の精度を維持する。 */
export function CameraTrackingFields({
    settings,
    uiState,
    uiHints,
    onApplySettings,
    gridDensity = "regular",
    toggleDensity = "regular",
}: CharacterDisplayTogglesProps) {
    return (
        <SettingsFieldStack>
            <SettingsToggleGrid density={gridDensity}>
                <SettingsToggle
                    density={toggleDensity}
                    label="顔の向き・視線をカメラで追跡"
                    disabledReason={uiHints.enableCharacterGazeReason}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <SettingsToggle
                    density={toggleDensity}
                    label="体の姿勢をカメラで追跡"
                    disabledReason="先に3Dキャラクター表示と顔・視線の追跡をオンにしてください。"
                    description="「キャラクターになる」で反映します。"
                    checked={!!settings.enableSincroPoseTracking}
                    disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                    onChange={(checked) => onApplySettings({ enableSincroPoseTracking: checked })}
                />
            </SettingsToggleGrid>
            <SettingsRange
                label="姿勢の反映量"
                disabledReason="3Dキャラクター表示・顔の向き・姿勢をオンにすると調整できます。"
                help={settingHelp.sincroPoseRetargetScale}
                {...sincroAppNumericSettingConstraints.sincroPoseRetargetScale}
                step="any"
                value={settings.sincroPoseRetargetScale}
                valueLabel={`${Number((settings.sincroPoseRetargetScale * 100).toFixed(10))}%`}
                disabled={
                    !settings.enableCharacter ||
                    !settings.enableCharacterGaze ||
                    !settings.enableSincroPoseTracking
                }
                onChange={(value) => onApplySettings({ sincroPoseRetargetScale: value })}
            />
            <SettingsRange
                label="目線の動きの強さ"
                disabledReason="3Dキャラクター表示と顔・視線の追跡をオンにすると調整できます。"
                help={settingHelp.characterEyeTrackingScale}
                {...sincroAppNumericSettingConstraints.characterEyeTrackingScale}
                step="any"
                value={settings.characterEyeTrackingScale}
                valueLabel={`${Number((settings.characterEyeTrackingScale * 100).toFixed(10))}%`}
                disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                onChange={(value) => onApplySettings({ characterEyeTrackingScale: value })}
            />
            {uiHints.enableCharacterGazeReason && !uiState.enableCharacterGazeDisabled && (
                <SettingsHint tone="warning">{uiHints.enableCharacterGazeReason}</SettingsHint>
            )}
        </SettingsFieldStack>
    );
}
