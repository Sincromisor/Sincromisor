import { DebugMetricItem } from "./debugMetricItem";

export type DebugMetricGridItem = {
    label: string;
    value: string;
    valueClassName?: string;
};

type DebugMetricGridProps = {
    items: DebugMetricGridItem[];
    className?: string;
};

export function DebugMetricGrid({ items, className }: DebugMetricGridProps) {
    return (
        <div className={["metricGrid", className ?? ""].filter(Boolean).join(" ")}>
            {items.map((item) => (
                <DebugMetricItem
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    valueClassName={item.valueClassName}
                />
            ))}
        </div>
    );
}
