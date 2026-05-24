import { SettingsBasicSection } from "../../../../features/settings/react/sections/settingsBasicSection";
import type { SincroAppSettingsSnapshot, SincroAppSettingsUiState } from "../panelTypes";

type BasicSettingsSectionProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onTitleChange: (titleText: string) => void;
    onTalkModeChange: (talkMode: string) => void;
    showTitle?: boolean;
    showTalkMode?: boolean;
    showSectionTitle?: boolean;
};

export function BasicSettingsSection({
    settings,
    uiState,
    onTitleChange,
    onTalkModeChange,
    showTitle = true,
    showTalkMode = true,
    showSectionTitle = false,
}: BasicSettingsSectionProps) {
    return (
        <SettingsBasicSection
            settings={settings}
            uiState={uiState}
            onTitleChange={onTitleChange}
            onTalkModeChange={onTalkModeChange}
            showTitle={showTitle}
            showTalkMode={showTalkMode}
            showSectionTitle={showSectionTitle}
            sectionTitle="会話設定"
            sectionTitleStyle="helpLabel"
        />
    );
}
