type DebugCheckboxControlProps = {
    id: string;
    label: string;
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
};

export function DebugCheckboxControl({
    id,
    label,
    checked,
    disabled = false,
    onChange,
}: DebugCheckboxControlProps) {
    return (
        <label className="audioControlCheckLabel" htmlFor={id}>
            <input
                id={id}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(event) => onChange(event.currentTarget.checked)}
            />
            {label}
        </label>
    );
}
