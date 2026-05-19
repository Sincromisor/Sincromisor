type RangeControlProps = {
    id: string;
    label: string;
    valueLabel: string;
    min: string;
    max: string;
    step: string;
    value: number;
    disabled?: boolean;
    onChange: (value: number) => void;
};

export function RangeControl({
    id,
    label,
    valueLabel,
    min,
    max,
    step,
    value,
    disabled = false,
    onChange,
}: RangeControlProps) {
    return (
        <div className="audioControlGroup">
            <label className="audioControlLabel" htmlFor={id}>
                {label}
                <span>{valueLabel}</span>
            </label>
            <input
                id={id}
                className="audioControlRange"
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                disabled={disabled}
                onChange={(event) => onChange(Number.parseFloat(event.currentTarget.value))}
            />
        </div>
    );
}
