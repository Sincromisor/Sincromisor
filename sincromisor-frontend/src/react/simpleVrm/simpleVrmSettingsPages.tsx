import { settingsPageCopy } from "../settingsShell/settingsPageCopy";
import type { SettingsShellPage } from "../settingsShell/settingsShell";
import {
    BasicSettingsSection,
    CharacterSettingsSection,
    MicSettingsSection,
    SettingsCategorySection,
} from "./components/settingsSections";
import type {
    SimpleVrmControlPanelPageProps,
    SimpleVrmPanelState,
} from "./simpleVrmControlPanelTypes";

export function createSimpleVrmSettingsPages(panelState: SimpleVrmPanelState): SettingsShellPage[] {
    return [
        {
            id: "conversation",
            label: settingsPageCopy.conversation.label,
            title: settingsPageCopy.conversation.title,
            content: <ConversationSettingsPage panelState={panelState} />,
        },
        {
            id: "devices",
            label: settingsPageCopy.devices.label,
            title: settingsPageCopy.devices.title,
            content: <DeviceSettingsPage panelState={panelState} />,
        },
        {
            id: "audio",
            label: settingsPageCopy.audio.label,
            title: settingsPageCopy.audio.title,
            description: settingsPageCopy.audio.description,
            content: <AudioSettingsPage panelState={panelState} />,
        },
        {
            id: "display",
            label: settingsPageCopy.display.label,
            title: settingsPageCopy.display.title,
            content: <DisplaySettingsPage panelState={panelState} />,
        },
    ];
}

function ConversationSettingsPage({ panelState }: SimpleVrmControlPanelPageProps) {
    return (
        <SettingsCategorySection title={settingsPageCopy.conversation.sectionTitle}>
            <BasicSettingsSection
                settings={panelState.settings}
                uiState={panelState.settingsUiState}
                onTitleChange={(titleText) => panelState.applySettings({ titleText })}
                onTalkModeChange={panelState.changeTalkMode}
                showTitle={true}
                showTalkMode={true}
                showSectionTitle={false}
            />
        </SettingsCategorySection>
    );
}

function DeviceSettingsPage({ panelState }: SimpleVrmControlPanelPageProps) {
    return (
        <SettingsCategorySection title={settingsPageCopy.devices.sectionTitle}>
            <MicSettingsSection
                settings={panelState.settings}
                uiState={panelState.settingsUiState}
                uiHints={panelState.settingsUiHints}
                mediaDeviceSnapshot={panelState.mediaDeviceSnapshot}
                audioInputSelection={panelState.audioInputSelection}
                onApplySettings={panelState.applySettings}
                onRefreshDevices={panelState.refreshDevices}
                showSectionTitle={false}
                mode="device"
            />
            <CharacterSettingsSection
                settings={panelState.settings}
                uiState={panelState.settingsUiState}
                uiHints={panelState.settingsUiHints}
                mediaDeviceSnapshot={panelState.mediaDeviceSnapshot}
                audioInputSelection={panelState.audioInputSelection}
                videoInputSelection={panelState.videoInputSelection}
                onApplySettings={panelState.applySettings}
                onRefreshDevices={panelState.refreshDevices}
                showSectionTitle={false}
                mode="camera"
            />
        </SettingsCategorySection>
    );
}

function AudioSettingsPage({ panelState }: SimpleVrmControlPanelPageProps) {
    return (
        <SettingsCategorySection title={settingsPageCopy.audio.sectionTitle}>
            <MicSettingsSection
                settings={panelState.settings}
                uiState={panelState.settingsUiState}
                uiHints={panelState.settingsUiHints}
                mediaDeviceSnapshot={panelState.mediaDeviceSnapshot}
                audioInputSelection={panelState.audioInputSelection}
                onApplySettings={panelState.applySettings}
                onRefreshDevices={panelState.refreshDevices}
                showSectionTitle={false}
                mode="processing"
            />
        </SettingsCategorySection>
    );
}

function DisplaySettingsPage({ panelState }: SimpleVrmControlPanelPageProps) {
    return (
        <SettingsCategorySection title={settingsPageCopy.display.sectionTitle}>
            <CharacterSettingsSection
                settings={panelState.settings}
                uiState={panelState.settingsUiState}
                uiHints={panelState.settingsUiHints}
                mediaDeviceSnapshot={panelState.mediaDeviceSnapshot}
                audioInputSelection={panelState.audioInputSelection}
                videoInputSelection={panelState.videoInputSelection}
                onApplySettings={panelState.applySettings}
                onRefreshDevices={panelState.refreshDevices}
                showSectionTitle={false}
                mode="display"
            />
        </SettingsCategorySection>
    );
}
