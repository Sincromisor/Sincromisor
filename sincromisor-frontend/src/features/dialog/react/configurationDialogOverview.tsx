import {
    ExperienceSettingsFields,
    PurposeDeviceField,
} from "../../settings/react/pages/purposeSettingsPages";
import { SettingsToggle } from "../../settings/react/primitives/settingsPrimitives";
import { VrmModelSection } from "./components/dialogSettingsSections";
import { StartupMediaNotice } from "./components/startupMediaNotice";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

/** 開始に必要な体験・モデル・入力だけを見せ、細かい調整は詳細表示へ委ねる。 */
export function ConfigurationDialogOverview({
    state,
    onOpenFilePicker,
}: {
    state: ReturnType<typeof useConfigurationDialogSettingsState>;
    onOpenFilePicker: () => void;
}) {
    return (
        <div className="settingsShell__detail">
            <div className="settingsShell__detailScroll configurationDialogReactSettingsPanel__overview">
                <ExperienceSettingsFields state={state} />
                <VrmModelSection
                    onOpenFilePicker={onOpenFilePicker}
                    uiState={state.dialogVrmUiState}
                />
                <PurposeDeviceField state={state} kind="audio" />
                <SettingsToggle
                    label="カメラを使う"
                    description="映像はブラウザー内で処理し、送信しません。"
                    checked={state.settings.enableCharacterGaze}
                    disabled={state.settingsUiState.enableCharacterGazeDisabled}
                    disabledReason={state.settingsUiHints.enableCharacterGazeReason}
                    onChange={(enableCharacterGaze) => state.applySettings({ enableCharacterGaze })}
                />
                {state.settings.enableCharacterGaze ? (
                    <PurposeDeviceField state={state} kind="video" />
                ) : null}
                <StartupMediaNotice settings={state.settings} />
            </div>
        </div>
    );
}
