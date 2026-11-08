import { useEffect, useId, useState } from "react";
import {
    SettingsHelpLabel,
    SettingsInput,
} from "../../../../features/settings/react/primitives/settingsPrimitives";

type NumericSettingFieldProps = {
    label: string;
    help?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
};

/** 入力途中はローカルに保持し、Enterかフォーカス移動で適用する。丸めと範囲制御は適用側が担う。 */
export function NumericSettingField({
    label,
    help,
    value,
    min,
    max,
    step,
    onChange,
}: NumericSettingFieldProps) {
    const inputId = useId();
    const [draft, setDraft] = useState<string>();
    // プリセットなど外部で確定値が変わったときは、その値を表示する。
    useEffect(() => setDraft(String(value)), [value]);
    return (
        <div style={{ display: "grid", gap: "4px" }}>
            <SettingsHelpLabel htmlFor={inputId} text={label} help={help} />
            <SettingsInput
                id={inputId}
                type="number"
                value={draft ?? value}
                min={min}
                max={max}
                step={step}
                onChange={(event) => setDraft(event.currentTarget.value)}
                onBlur={(event) => {
                    // 空欄や未完成の負号は0として保存せず、直前の確定値へ戻す。
                    const nextValue = event.currentTarget.valueAsNumber;
                    if (Number.isFinite(nextValue)) onChange(nextValue);
                    setDraft(undefined);
                }}
                onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") {
                        event.stopPropagation();
                        setDraft(undefined);
                    }
                }}
            />
        </div>
    );
}
