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
                    label="顔の向きを使う"
                    disabledReason={uiHints.enableCharacterGazeReason}
                    description={settingHelp.enableCharacterGaze}
                    checked={!!settings.enableCharacterGaze}
                    disabled={uiState.enableCharacterGazeDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacterGaze: checked })}
                />
                <SettingsToggle
                    density={toggleDensity}
                    label="姿勢を使う"
                    disabledReason="先に3Dキャラクター表示と「顔の向きを使う」をオンにしてください。"
                    description={settingHelp.enableSincroPoseTracking}
                    checked={!!settings.enableSincroPoseTracking}
                    disabled={!settings.enableCharacter || !settings.enableCharacterGaze}
                    onChange={(checked) => onApplySettings({ enableSincroPoseTracking: checked })}
                />
            </SettingsToggleGrid>
            <SettingsRange
                label="姿勢同期"
                disabledReason="3Dキャラクター表示・顔の向き・姿勢をオンにすると調整できます。"
                description={settingHelp.sincroPoseRetargetScale}
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
                label="目線追跡"
                disabledReason="3Dキャラクター表示と「顔の向きを使う」をオンにすると調整できます。"
                description={settingHelp.characterEyeTrackingScale}
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
