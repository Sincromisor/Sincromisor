import {
    TalkModeField,
    TitleTextField,
} from "../../../../features/settings/react/fields/settingsFields";
import { SettingsHelpLabel } from "../../../../features/settings/react/primitives/settingsPrimitives";
import type { SincroAppSettingsSnapshot, SincroAppSettingsUiState } from "../panelTypes";
import { detailsContentTopMarginPx, sectionSpacingPx } from "./settingsSectionLayout";

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
    if (!showTitle && !showTalkMode) {
        // variant 側で表示対象を完全に外した場合は空描画にする。
        return null;
    }
    return (
        <>
            {showSectionTitle ? <SettingsHelpLabel text="会話設定" /> : null}
            {showTitle ? (
                <TitleTextField
                    settings={settings}
                    uiState={uiState}
                    onTitleChange={onTitleChange}
                    style={{
                        marginTop: `${detailsContentTopMarginPx}px`,
                        marginBottom: `${sectionSpacingPx}px`,
                    }}
                />
            ) : null}
            {showTalkMode ? (
                <TalkModeField
                    settings={settings}
                    uiState={uiState}
                    onTalkModeChange={onTalkModeChange}
                    style={{ marginBottom: `${sectionSpacingPx}px` }}
                />
            ) : null}
        </>
    );
}
