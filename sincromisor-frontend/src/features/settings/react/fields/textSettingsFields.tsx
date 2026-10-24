import { useId } from "react";
import { SettingsHelpLabel, SettingsInput } from "../primitives/settingsPrimitives";
import type { SettingsFieldProps } from "./settingsFieldTypes";
import { settingHelp } from "./settingsHelp";
import "./talkModeField.css";

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

const normalModes = [
    ["chat", "キャラクターと話す"],
    ["sincro", "キャラクターになる"],
] as const;
const diagnosticModes = [
    ["echo", "入力音声を折り返す"],
    ["playback", "サンプル音声を繰り返す"],
] as const;

/** 通常の二体験を先に示し、診断は開閉領域へまとめて現在の選択を保つ。 */
export function TalkModeField({
    settings,
    uiState,
    onTalkModeChange,
    className,
    style,
}: SettingsFieldProps & { onTalkModeChange: (talkMode: string) => void }) {
    const inputId = useId();
    const diagnostic = diagnosticModes.find(([value]) => value === settings.talkMode);
    const description =
        settings.talkMode === "echo"
            ? "フィルターとVADを通った入力を返します。ヘッドホンをご使用ください。自動ミュートは適用しません。"
            : settings.talkMode === "playback"
              ? "既定音声: VOICEVOX:ずんだもんを繰り返します。入力は音声再生へ影響しません。"
              : undefined;
    const choice = ([value, label]: readonly [string, string]) => (
        <label key={value} className="talkModeField__choice">
            <input
                type="radio"
                name={inputId}
                value={value}
                checked={settings.talkMode === value}
                disabled={uiState.talkModeDisabled}
                aria-describedby={
                    settings.talkMode === value && description
                        ? `${inputId}-description`
                        : undefined
                }
                onChange={() => onTalkModeChange(value)}
            />
            {label}
        </label>
    );
    return (
        <fieldset className={`talkModeField ${className ?? ""}`} style={style}>
            <legend>体験を選ぶ</legend>
            {normalModes.map(choice)}
            <details className="talkModeField__diagnostics" open={!!diagnostic}>
                <summary>音声診断{diagnostic && <span>：{diagnostic[1]}</span>}</summary>
                {diagnosticModes.map(choice)}
            </details>
            {description && (
                <p id={`${inputId}-description`} className="settingsPrimitiveFieldDescription">
                    {description}
                </p>
            )}
        </fieldset>
    );
}
