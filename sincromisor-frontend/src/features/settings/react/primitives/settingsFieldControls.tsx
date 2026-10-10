import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { useId } from "react";
import { joinClassNames } from "./settingsClassNames";
import { SettingsHelpLabel } from "./settingsHelp";

type SettingsRangeProps = {
    label: string;
    help?: string;
    value: number;
    valueLabel: string;
    min: number;
    max: number;
    step: number | "any";
    disabled?: boolean;
    onChange: (value: number) => void;
};

/** 入力属性とラベルの関連付けを保ったまま共通の外観を適用する。 */
export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input {...props} className={joinClassNames("settingsPrimitiveField", props.className)} />
    );
}

/** 選択欄の属性と選択肢を保ったまま共通の外観を適用する。 */
export function SettingsSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select {...props} className={joinClassNames("settingsPrimitiveField", props.className)} />
    );
}

/** 設定値を丸めず表示し、操作時だけ共通設定の正規化へ入力を渡す。 */
export function SettingsRange({
    label,
    help,
    value,
    valueLabel,
    min,
    max,
    step,
    disabled = false,
    onChange,
}: SettingsRangeProps) {
    const inputId = useId();
    return (
        <div className={joinClassNames("settingsPrimitiveRange", disabled && "is-disabled")}>
            <span className="settingsPrimitiveRange__header">
                <SettingsHelpLabel htmlFor={inputId} text={label} help={help} />
                <span className="settingsPrimitiveRange__value">{valueLabel}</span>
            </span>
            <input
                id={inputId}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                className="settingsPrimitiveRange__input"
                onChange={(event) => onChange(Number.parseFloat(event.currentTarget.value))}
            />
        </div>
    );
}
