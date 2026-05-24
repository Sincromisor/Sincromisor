import type {
    SincroAppSettingsSnapshot,
    SincroAppSettingsUiState,
} from "../../../../app/controller";
import { TalkModeField, TitleTextField } from "../fields/settingsFields";
import { SettingsHelpLabel, SettingsSubsectionTitle } from "../primitives/settingsPrimitives";

type SettingsBasicSectionProps = {
    settings: SincroAppSettingsSnapshot;
    uiState: SincroAppSettingsUiState;
    onTitleChange: (titleText: string) => void;
    onTalkModeChange: (talkMode: string) => void;
    showTitle?: boolean;
    showTalkMode?: boolean;
    showSectionTitle?: boolean;
    sectionTitle?: string;
    sectionTitleStyle?: "helpLabel" | "subsection";
};

export function SettingsBasicSection({
    settings,
    uiState,
    onTitleChange,
    onTalkModeChange,
    showTitle = true,
    showTalkMode = true,
    showSectionTitle = true,
    sectionTitle = "基本設定",
    sectionTitleStyle = "subsection",
}: SettingsBasicSectionProps) {
    if (!showTitle && !showTalkMode) {
        // 表示対象を variant 側で完全に外す画面では、空の余白を残さない。
        return null;
    }

    return (
        <div className="settingsPrimitiveFieldStack">
            {showSectionTitle ? (
                <SettingsBasicSectionTitle title={sectionTitle} styleKind={sectionTitleStyle} />
            ) : null}
            {showTitle ? (
                <TitleTextField
                    settings={settings}
                    uiState={uiState}
                    onTitleChange={onTitleChange}
                />
            ) : null}
            {showTalkMode ? (
                <TalkModeField
                    settings={settings}
                    uiState={uiState}
                    onTalkModeChange={onTalkModeChange}
                />
            ) : null}
        </div>
    );
}

function SettingsBasicSectionTitle({
    title,
    styleKind,
}: {
    title: string;
    styleKind: "helpLabel" | "subsection";
}) {
    if (styleKind === "helpLabel") {
        return <SettingsHelpLabel text={title} />;
    }
    return <SettingsSubsectionTitle>{title}</SettingsSubsectionTitle>;
}
