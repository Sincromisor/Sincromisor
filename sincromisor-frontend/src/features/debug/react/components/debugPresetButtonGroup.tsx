import type { ReactNode } from "react";

export type DebugPresetButtonItem = {
    id: string;
    label: ReactNode;
    disabled?: boolean;
    dataAttributes?: Record<string, string>;
    onClick: () => void;
};

type DebugPresetButtonGroupProps = {
    items: readonly DebugPresetButtonItem[];
    legend?: string;
    className?: string;
    buttonClassName?: string;
};

export function DebugPresetButtonGroup({
    items,
    legend,
    className,
    buttonClassName,
}: DebugPresetButtonGroupProps) {
    if (legend !== undefined) {
        return (
            <fieldset className={className ?? "audioPresetButtons"}>
                <legend className="audioPresetButtons__legend">{legend}</legend>
                <DebugPresetButtons items={items} buttonClassName={buttonClassName} />
            </fieldset>
        );
    }

    return (
        <div className={className ?? "audioControlPresetButtons"}>
            <DebugPresetButtons items={items} buttonClassName={buttonClassName} />
        </div>
    );
}

type DebugPresetButtonsProps = {
    items: readonly DebugPresetButtonItem[];
    buttonClassName?: string;
};

function DebugPresetButtons({ items, buttonClassName }: DebugPresetButtonsProps) {
    return (
        <>
            {items.map((item) => (
                <button
                    key={item.id}
                    {...item.dataAttributes}
                    type="button"
                    className={buttonClassName}
                    disabled={item.disabled}
                    onClick={item.onClick}
                >
                    {item.label}
                </button>
            ))}
        </>
    );
}
