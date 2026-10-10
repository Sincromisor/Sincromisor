import { useSincroAppControllerSettingsState } from "../../../../app/react/useSincroAppControllerSettingsState";
import { settingHelp } from "../../../settings/react/fields/settingsHelp";
import { SettingsToggle } from "../../../settings/react/primitives/settingsPrimitives";

/** 診断専用の強制継続を既存設定ストアへ接続し、通常UIと同じ依存条件を守る。 */
export function ForcePoseTrackingControl() {
    const {
        currentController,
        settings,
        settingsUiState: uiState,
    } = useSincroAppControllerSettingsState();
    const onApplySettings = currentController?.applySettings.bind(currentController);
    const toggleDensity = "regular";
    return (
        <SettingsToggle
            density={toggleDensity}
            label="姿勢を強制継続"
            help={settingHelp.forceSincroPoseTracking}
            checked={!!settings.forceSincroPoseTracking}
            disabled={
                uiState.forceSincroPoseTrackingDisabled ||
                !settings.enableCharacter ||
                !settings.enableCharacterGaze ||
                !settings.enableSincroPoseTracking
            }
            onChange={(checked) => onApplySettings?.({ forceSincroPoseTracking: checked })}
        />
    );
}
