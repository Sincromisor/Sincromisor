import {
    SettingsFieldStack,
    SettingsHint,
    SettingsToggle,
    SettingsToggleGrid,
} from "../primitives/settingsPrimitives";
import type { ToggleGroupProps } from "./settingsFieldTypes";

type CharacterDisplayTogglesProps = ToggleGroupProps & {
    uiHints: {
        enableCharacterReason?: string;
        enableCharacterGazeReason?: string;
        enableAutoMuteReason?: string;
    };
};
/** 視線に依存する自動ミュートを音声分類へ表示し、操作可否と理由をモデルから受け取る。 */
export function AutoMuteField({
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
                    label="顔の向きでマイクを自動ミュート"
                    disabledReason={uiHints.enableAutoMuteReason}
                    checked={!!settings.enableAutoMute}
                    disabled={uiState.enableAutoMuteDisabled}
                    onChange={(checked) => onApplySettings({ enableAutoMute: checked })}
                />
            </SettingsToggleGrid>

            {uiHints.enableAutoMuteReason && !uiState.enableAutoMuteDisabled ? (
                <SettingsHint>{uiHints.enableAutoMuteReason}</SettingsHint>
            ) : null}
        </SettingsFieldStack>
    );
}
