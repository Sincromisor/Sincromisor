export type DebugRangeControlItem = {
    id: string;
    label: string;
    valueLabel: string;
    min: number | string;
    max: number | string;
    step: number | string;
    value: number;
    disabled?: boolean;
    onChange: (value: number) => void;
};

type DebugRangeControlProps = DebugRangeControlItem;

type DebugRangeControlListProps = {
    items: readonly DebugRangeControlItem[];
};

export function DebugRangeControl({
    id,
    label,
    valueLabel,
    min,
    max,
    step,
    value,
    disabled = false,
    onChange,
}: DebugRangeControlProps) {
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

export function DebugRangeControlList({ items }: DebugRangeControlListProps) {
    return (
        <>
            {items.map((item) => (
                <DebugRangeControl key={item.id} {...item} />
            ))}
        </>
    );
}
