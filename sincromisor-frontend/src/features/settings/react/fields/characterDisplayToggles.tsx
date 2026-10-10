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
/** 3D表示と会話時の動作量を既存モデルへ適用する。保存値はrangeで丸めない。 */
export function CharacterDisplayToggles({
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
                    label="3Dキャラクターを表示"
                    help={settingHelp.enableCharacter}
                    checked={!!settings.enableCharacter}
                    disabled={uiState.enableCharacterDisabled}
                    onChange={(checked) => onApplySettings({ enableCharacter: checked })}
                />
            </SettingsToggleGrid>
            <SettingsRange
                label="上半身モーション"
                help={settingHelp.characterMotionScale}
                {...sincroAppNumericSettingConstraints.characterMotionScale}
                step="any"
                value={settings.characterMotionScale}
                valueLabel={`${Number((settings.characterMotionScale * 100).toFixed(10))}%`}
                disabled={!settings.enableCharacter}
                onChange={(value) => onApplySettings({ characterMotionScale: value })}
            />

            {uiHints.enableCharacterReason ? (
                <SettingsHint>{uiHints.enableCharacterReason}</SettingsHint>
            ) : null}
        </SettingsFieldStack>
    );
}
