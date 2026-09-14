import { createCoreSettingsPages } from "../../../features/settings/react/pages/coreSettingsPages";
import { SettingsCategorySection } from "../../../features/settings/react/sections/settingsCategorySection";
import { settingsPageCopy } from "../../../features/settings/react/shell/settingsPageCopy";
import type { SettingsShellPage } from "../../../features/settings/react/shell/settingsShell";
import {
    BasicSettingsSection,
    CharacterSettingsSection,
    MicSettingsSection,
} from "./components/settingsSections";
import type { SincroControlPanelPageProps, SincroPanelState } from "./sincroControlPanelTypes";

/** アプリの設定・操作を共通入力部品へ接続し、会話・機器・音声・表示を組み立てる。 */
export function createSincroSettingsPages(panelState: SincroPanelState): SettingsShellPage[] {
    return createCoreSettingsPages({
        conversation: <ConversationSettingsPage panelState={panelState} />,
        devices: <DeviceSettingsPage panelState={panelState} />,
        audio: <AudioSettingsPage panelState={panelState} />,
        display: <DisplaySettingsPage panelState={panelState} />,
    });
}

function ConversationSettingsPage({ panelState }: SincroControlPanelPageProps) {
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

function DeviceSettingsPage({ panelState }: SincroControlPanelPageProps) {
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
                calibrationState={panelState.calibrationState}
                onRetryCalibration={panelState.retryCalibration}
            />
        </SettingsCategorySection>
    );
}

function AudioSettingsPage({ panelState }: SincroControlPanelPageProps) {
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

function DisplaySettingsPage({ panelState }: SincroControlPanelPageProps) {
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
