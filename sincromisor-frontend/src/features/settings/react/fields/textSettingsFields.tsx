import { useId } from "react";
import { SettingsHelpLabel, SettingsInput, SettingsSelect } from "../primitives/settingsPrimitives";
import type { SettingsFieldProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";

/** 項目名を入力へ関連付け、変更を共通設定の適用窓口へ渡す。 */
export function TitleTextField({
    settings,
    uiState,
    onTitleChange,
    className,
    style,
}: SettingsFieldProps & { onTitleChange: (titleText: string) => void }) {
    const inputId = useId();
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel htmlFor={inputId} text="タイトル" help={settingHelp.titleText} />
            <SettingsInput
                id={inputId}
                type="text"
                value={settings.titleText ?? ""}
                onChange={(event) => onTitleChange(event.target.value)}
                disabled={uiState.titleTextDisabled}
            />
        </div>
    );
}

/** 項目名を入力へ関連付け、変更を共通設定の適用窓口へ渡す。 */
export function TalkModeField({
    settings,
    uiState,
    onTalkModeChange,
    className,
    style,
}: SettingsFieldProps & { onTalkModeChange: (talkMode: string) => void }) {
    const inputId = useId();
    return (
        <div className={className} style={style}>
            <SettingsHelpLabel htmlFor={inputId} text="体験を選ぶ" help={settingHelp.talkMode} />
            <SettingsSelect
                id={inputId}
                aria-describedby={`${inputId}-description`}
                value={settings.talkMode}
                onChange={(event) => onTalkModeChange(event.target.value)}
                disabled={uiState.talkModeDisabled}
            >
                <option value="chat">キャラクターと話す</option>
                <option value="sincro">キャラクターになる</option>
            </SettingsSelect>
            <p id={`${inputId}-description`} className="settingsPrimitiveFieldDescription">
                {settings.talkMode === "sincro"
                    ? "カメラで顔や体の動きをキャラクターに重ねます。"
                    : "マイクで話しかけると、キャラクターが声で答えます。"}
            </p>
        </div>
    );
}
