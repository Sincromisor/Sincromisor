import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { joinClassNames } from "./settingsClassNames";
import { SettingsHelpLabel } from "./settingsHelp";

type SettingsRangeProps = {
    label: string;
    help?: string;
    value: number;
    valueLabel: string;
    min: number;
    max: number;
    step: number;
    disabled?: boolean;
    onChange: (value: number) => void;
};

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input {...props} className={joinClassNames("settingsPrimitiveField", props.className)} />
    );
}

export function SettingsSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
    return (
        <select {...props} className={joinClassNames("settingsPrimitiveField", props.className)} />
    );
}

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
    return (
        <label className={joinClassNames("settingsPrimitiveRange", disabled && "is-disabled")}>
            <span className="settingsPrimitiveRange__header">
                <SettingsHelpLabel text={label} help={help} />
                <span className="settingsPrimitiveRange__value">{valueLabel}</span>
            </span>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                className="settingsPrimitiveRange__input"
                onChange={(event) => onChange(Number.parseFloat(event.currentTarget.value))}
            />
        </label>
    );
}
