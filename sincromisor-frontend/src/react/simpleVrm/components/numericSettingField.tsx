import { SettingsHelpBadge, SettingsInput } from "../../settingsPrimitives/settingsPrimitives";

type NumericSettingFieldProps = {
    label: string;
    help?: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
};

export function NumericSettingField({
    label,
    help,
    value,
    min,
    max,
    step,
    onChange,
}: NumericSettingFieldProps) {
    return (
        // 数値入力の最終丸めは AppController 側で行うため、UI では入力値をそのまま渡す。
        <div style={{ display: "grid", gap: "4px" }}>
            <span style={{ opacity: 0.8, display: "flex", alignItems: "center" }}>
                {label}
                {help ? <SettingsHelpBadge help={help} /> : null}
            </span>
            <SettingsInput
                type="number"
                value={Number.isFinite(value) ? value : 0}
                min={min}
                max={max}
                step={step}
                aria-label={label}
                onChange={(event) => {
                    const nextValue = Number(event.target.value);
                    if (!Number.isFinite(nextValue)) {
                        return;
                    }
                    // 最終的な丸め/範囲制御は AppController 側で行い、UIは入力値をそのまま渡す。
                    onChange(nextValue);
                }}
            />
        </div>
    );
}
