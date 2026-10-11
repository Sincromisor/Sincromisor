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
                <option value="echo">入力音声を折り返す</option>
                <option value="playback">サンプル音声を繰り返す</option>
            </SettingsSelect>
            <p id={`${inputId}-description`} className="settingsPrimitiveFieldDescription">
                {settings.talkMode === "sincro"
                    ? "カメラで顔や体の動きをキャラクターに重ねます。"
                    : settings.talkMode === "echo"
                      ? "音声診断：フィルターとVADを通った入力を返します。ヘッドホンをご使用ください。自動ミュートは適用しません。"
                      : settings.talkMode === "playback"
                        ? "既定音声: VOICEVOX:ずんだもんを繰り返します。入力は音声再生へ影響しません。"
                        : "マイクで話しかけると、キャラクターが声で答えます。"}
            </p>
            <p className="settingsPrimitiveFieldDescription">
                モードの変更は停止後の再接続で反映します。
            </p>
        </div>
    );
}
