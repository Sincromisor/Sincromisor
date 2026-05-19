type DebugMetricItemProps = {
    label: string;
    value: string;
    valueClassName?: string;
    className?: string;
};

export function DebugMetricItem({ label, value, valueClassName, className }: DebugMetricItemProps) {
    return (
        <div className={["metricItem", className ?? ""].filter(Boolean).join(" ")}>
            <span className="metricLabel">{label}</span>
            <span className={["metricValue", valueClassName ?? ""].filter(Boolean).join(" ")}>
                {value}
            </span>
        </div>
    );
}
