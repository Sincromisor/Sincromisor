import { createCoreSettingsPages } from "../../settings/react/pages/coreSettingsPages";
import { SettingsCategorySection } from "../../settings/react/sections/settingsCategorySection";
import { settingsPageCopy } from "../../settings/react/shell/settingsPageCopy";
import type { SettingsShellPage } from "../../settings/react/shell/settingsShell";
import {
    DialogBasicSettingsSection,
    DialogCharacterSettingsSection,
    DialogDeviceSettingsSection,
    DialogMicSettingsSection,
} from "./components/dialogSettingsFormSections";
import { DialogVrmDropStatusCard, VrmModelSection } from "./components/dialogSettingsSections";
import { ConfigurationDialogConnectionPage } from "./configurationDialogConnectionPage";
import type { useConfigurationDialogSettingsState } from "./useConfigurationDialogSettingsState";

type ConfigurationDialogSettingsState = ReturnType<typeof useConfigurationDialogSettingsState>;

type ConfigurationDialogSettingsPagesOptions = {
    state: ConfigurationDialogSettingsState;
    onOpenFilePicker: () => void;
};

export function createConfigurationDialogSettingsPages({
    state,
    onOpenFilePicker,
}: ConfigurationDialogSettingsPagesOptions): SettingsShellPage[] {
    return createCoreSettingsPages({
        conversation: (
            <SettingsCategorySection title={settingsPageCopy.conversation.sectionTitle}>
                <DialogBasicSettingsSection
                    settings={state.settings}
                    uiState={state.settingsUiState}
                    onTitleChange={(titleText) => state.applySettings({ titleText })}
                    onTalkModeChange={state.changeTalkMode}
                    showSectionTitle={false}
                />
            </SettingsCategorySection>
        ),
        devices: (
            <SettingsCategorySection title={settingsPageCopy.devices.sectionTitle}>
                <DialogDeviceSettingsSection
                    settings={state.settings}
                    uiState={state.settingsUiState}
                    uiHints={state.settingsUiHints}
                    snapshot={state.mediaDeviceSnapshot}
                    audioInputSelection={state.audioInputSelection}
                    videoInputSelection={state.videoInputSelection}
                    onApplySettings={state.applySettings}
                    onRefreshDevices={state.refreshDevices}
                    showSectionTitle={false}
                />
            </SettingsCategorySection>
        ),
        audio: (
            <SettingsCategorySection>
                <DialogMicSettingsSection
                    settings={state.settings}
                    uiState={state.settingsUiState}
                    onApplySettings={state.applySettings}
                    showSectionTitle={false}
                    sectionTitle={settingsPageCopy.audio.sectionTitle}
                />
            </SettingsCategorySection>
        ),
        display: <DisplaySettingsPage state={state} onOpenFilePicker={onOpenFilePicker} />,
        connection: <ConfigurationDialogConnectionPage state={state} />,
    });
}

type DisplayPageOptions = {
    state: ConfigurationDialogSettingsState;
    onOpenFilePicker: () => void;
};

function DisplaySettingsPage({ state, onOpenFilePicker }: DisplayPageOptions) {
    return (
        <>
            <SettingsCategorySection title={settingsPageCopy.display.sectionTitle}>
                <DialogCharacterSettingsSection
                    settings={state.settings}
                    uiState={state.settingsUiState}
                    uiHints={state.settingsUiHints}
                    onApplySettings={state.applySettings}
                    showSectionTitle={false}
                />
            </SettingsCategorySection>
            <SettingsCategorySection title={settingsPageCopy.display.vrmSectionTitle}>
                <VrmModelSection onOpenFilePicker={onOpenFilePicker} />
                <DialogVrmDropStatusCard uiState={state.dialogVrmUiState} />
            </SettingsCategorySection>
        </>
    );
}
