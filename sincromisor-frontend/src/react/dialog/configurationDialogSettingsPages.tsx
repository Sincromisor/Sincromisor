import type { SettingsShellPage } from "../settings-shell/SettingsShell";
import { settingsPageCopy } from "../settings-shell/settingsPageCopy";
import {
    DialogBasicSettingsSection,
    DialogCharacterSettingsSection,
    DialogDeviceSettingsSection,
    DialogMicSettingsSection,
    DialogSettingsCategory,
} from "./components/DialogSettingsFormSections";
import { DialogVrmDropStatusCard, VrmModelSection } from "./components/DialogSettingsSections";
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
    return [
        createConversationPage(state),
        createDevicesPage(state),
        createAudioPage(state),
        createDisplayPage({ state, onOpenFilePicker }),
        createConnectionPage(state),
    ];
}

function createConversationPage(state: ConfigurationDialogSettingsState): SettingsShellPage {
    return {
        id: "conversation",
        label: settingsPageCopy.conversation.label,
        title: settingsPageCopy.conversation.title,
        content: (
            <DialogSettingsCategory title={settingsPageCopy.conversation.sectionTitle}>
                <DialogBasicSettingsSection
                    settings={state.settings}
                    uiState={state.settingsUiState}
                    onTitleChange={(titleText) => state.applySettings({ titleText })}
                    onTalkModeChange={state.changeTalkMode}
                    showSectionTitle={false}
                />
            </DialogSettingsCategory>
        ),
    };
}

function createDevicesPage(state: ConfigurationDialogSettingsState): SettingsShellPage {
    return {
        id: "devices",
        label: settingsPageCopy.devices.label,
        title: settingsPageCopy.devices.title,
        content: (
            <DialogSettingsCategory title={settingsPageCopy.devices.sectionTitle}>
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
            </DialogSettingsCategory>
        ),
    };
}

function createAudioPage(state: ConfigurationDialogSettingsState): SettingsShellPage {
    return {
        id: "audio",
        label: settingsPageCopy.audio.label,
        title: settingsPageCopy.audio.title,
        description: settingsPageCopy.audio.description,
        content: (
            <DialogSettingsCategory>
                <DialogMicSettingsSection
                    settings={state.settings}
                    uiState={state.settingsUiState}
                    onApplySettings={state.applySettings}
                    showSectionTitle={false}
                    sectionTitle={settingsPageCopy.audio.sectionTitle}
                />
            </DialogSettingsCategory>
        ),
    };
}

type DisplayPageOptions = {
    state: ConfigurationDialogSettingsState;
    onOpenFilePicker: () => void;
};

function createDisplayPage({ state, onOpenFilePicker }: DisplayPageOptions): SettingsShellPage {
    return {
        id: "display",
        label: settingsPageCopy.display.label,
        title: settingsPageCopy.display.title,
        content: (
            <>
                <DialogSettingsCategory title={settingsPageCopy.display.sectionTitle}>
                    <DialogCharacterSettingsSection
                        settings={state.settings}
                        uiState={state.settingsUiState}
                        uiHints={state.settingsUiHints}
                        onApplySettings={state.applySettings}
                        showSectionTitle={false}
                    />
                </DialogSettingsCategory>
                <DialogSettingsCategory title={settingsPageCopy.display.vrmSectionTitle}>
                    <VrmModelSection onOpenFilePicker={onOpenFilePicker} />
                    <DialogVrmDropStatusCard uiState={state.dialogVrmUiState} />
                </DialogSettingsCategory>
            </>
        ),
    };
}

function createConnectionPage(state: ConfigurationDialogSettingsState): SettingsShellPage {
    return {
        id: "connection",
        label: settingsPageCopy.connection.label,
        title: settingsPageCopy.connection.title,
        content: <ConfigurationDialogConnectionPage state={state} />,
    };
}
