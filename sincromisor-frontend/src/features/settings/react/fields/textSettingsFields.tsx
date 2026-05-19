import { SettingsHelpLabel, SettingsInput, SettingsSelect } from "../primitives/settingsPrimitives";
import type { SettingsFieldProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

export function TitleTextField({
    settings,
    uiState,
    onTitleChange,
    className,
    style,
}: SettingsFieldProps & { onTitleChange: (titleText: string) => void }) {
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel text="タイトル" help={settingHelp.titleText} />
            <SettingsInput
                type="text"
                value={settings.titleText ?? ""}
                onChange={(event) => onTitleChange(event.target.value)}
                disabled={uiState.titleTextDisabled}
            />
        </div>
    );
}

export function TalkModeField({
    settings,
    uiState,
    onTalkModeChange,
    className,
    style,
}: SettingsFieldProps & { onTalkModeChange: (talkMode: string) => void }) {
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel text="トークモード (talk mode)" help={settingHelp.talkMode} />
            <SettingsSelect
                value={settings.talkMode}
                onChange={(event) => onTalkModeChange(event.target.value)}
                disabled={uiState.talkModeDisabled}
            >
                <option value="chat">chat</option>
                <option value="sincro">sincro</option>
            </SettingsSelect>
        </div>
    );
}
