import { useEffect, useRef, useState } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import "./settingsPrimitives.css";

type HelpTooltipProps = {
    help?: string;
    children: ReactNode;
};

type HelpBadgeProps = {
    help: string;
};

type SettingsHelpLabelProps = {
    text: string;
    help?: string;
};

type SettingsButtonProps = {
    children: ReactNode;
    className?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

type SettingsHintProps = {
    children: ReactNode;
    tone?: "muted" | "info" | "warning";
    className?: string;
};

type SettingsSectionCardProps = {
    title?: string;
    description?: string;
    children: ReactNode;
    className?: string;
};

type SettingsToggleProps = {
    label: string;
    help?: string;
    checked: boolean;
    disabled?: boolean;
    density?: "compact" | "regular";
    onChange: (checked: boolean) => void;
};

type SettingsToggleGridProps = {
    children: ReactNode;
    density?: "compact" | "regular";
};

type SettingsFieldStackProps = {
    children: ReactNode;
    spacing?: "compact" | "regular";
};

type SettingsSubsectionTitleProps = {
    children: ReactNode;
    actions?: ReactNode;
};

function joinClassNames(...classNames: Array<string | false | null | undefined>): string {
    return classNames.filter(Boolean).join(" ");
}

export function SettingsHelpTooltip({ help, children }: HelpTooltipProps) {
    const containerRef = useRef<HTMLSpanElement | null>(null);
    const [visible, setVisible] = useState<boolean>(false);
    const [align, setAlign] = useState<"left" | "right">("left");

    useEffect(() => {
        if (!visible) {
            return;
        }
        const handlePointerDown = (event: PointerEvent) => {
            const root = containerRef.current;
            if (!root) {
                return;
            }
            if (event.target instanceof Node && !root.contains(event.target)) {
                setVisible(false);
            }
        };
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [visible]);

    useEffect(() => {
        if (!visible) {
            return;
        }
        const root = containerRef.current;
        if (!root) {
            return;
        }
        // Viewport midpoint alignment keeps the help bubble inside narrow dialogs and right-side panels.
        const rect = root.getBoundingClientRect();
        setAlign(rect.left < window.innerWidth / 2 ? "left" : "right");
    }, [visible]);

    if (!help) {
        return <>{children}</>;
    }

    return (
        <span
            ref={containerRef}
            className="settingsPrimitiveHelpTooltip"
            onClickCapture={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setVisible((prev) => !prev);
            }}
            onMouseEnter={() => setVisible(true)}
            onMouseLeave={() => setVisible(false)}
            onFocus={() => setVisible(true)}
            onBlur={() => setVisible(false)}
        >
            {children}
            {visible ? (
                <span
                    role="tooltip"
                    className={joinClassNames(
                        "settingsPrimitiveHelpTooltip__bubble",
                        align === "right" && "settingsPrimitiveHelpTooltip__bubble--right",
                    )}
                >
                    {help}
                </span>
            ) : null}
        </span>
    );
}

export function SettingsHelpBadge({ help }: HelpBadgeProps) {
    return (
        <SettingsHelpTooltip help={help}>
            <span
                tabIndex={0}
                role="button"
                aria-label="設定説明を表示"
                aria-haspopup="true"
                className="settingsPrimitiveHelpBadge"
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                }}
                onKeyDown={(event) => {
                    if (event.key === " " || event.key === "Enter") {
                        event.preventDefault();
                    }
                }}
            >
                ?
            </span>
        </SettingsHelpTooltip>
    );
}

export function SettingsHelpLabel({ text, help }: SettingsHelpLabelProps) {
    return (
        <div className="settingsPrimitiveHelpLabel">
            <span>{text}</span>
            {help ? <SettingsHelpBadge help={help} /> : null}
        </div>
    );
}

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
    return <input {...props} className={joinClassNames("settingsPrimitiveField", props.className)} />;
}

export function SettingsSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
    return <select {...props} className={joinClassNames("settingsPrimitiveField", props.className)} />;
}

export function SettingsButton({ children, className, ...props }: SettingsButtonProps) {
    return (
        <button {...props} className={joinClassNames("settingsPrimitiveButton", className)}>
            {children}
        </button>
    );
}

export function SettingsHint({ children, tone = "muted", className }: SettingsHintProps) {
    return (
        <div className={joinClassNames("settingsPrimitiveHint", `settingsPrimitiveHint--${tone}`, className)}>
            {children}
        </div>
    );
}

export function SettingsHintList({ messages }: { messages: string[] }) {
    if (messages.length === 0) {
        return null;
    }
    return (
        <div className="settingsPrimitiveHintList">
            {messages.map((message) => (
                <SettingsHint key={message}>{message}</SettingsHint>
            ))}
        </div>
    );
}

export function SettingsSectionCard({
    title,
    description,
    children,
    className,
}: SettingsSectionCardProps) {
    const hasHeader = !!title || !!description;
    return (
        <section className={joinClassNames("settingsPrimitiveSectionCard", className)}>
            {hasHeader ? (
                <div className="settingsPrimitiveSectionCard__header">
                    {title ? <div className="settingsPrimitiveSectionCard__title">{title}</div> : null}
                    {description ? <div className="settingsPrimitiveSectionCard__description">{description}</div> : null}
                </div>
            ) : null}
            <div className="settingsPrimitiveSectionCard__body">{children}</div>
        </section>
    );
}

export function SettingsToggleGrid({ children, density = "regular" }: SettingsToggleGridProps) {
    return (
        <div className={joinClassNames(
            "settingsPrimitiveToggleGrid",
            density === "compact" && "settingsPrimitiveToggleGrid--compact",
        )}>
            {children}
        </div>
    );
}

export function SettingsToggle({
    label,
    help,
    checked,
    disabled = false,
    density = "regular",
    onChange,
}: SettingsToggleProps) {
    return (
        <label className={joinClassNames(
            "settingsPrimitiveToggle",
            density === "compact" && "settingsPrimitiveToggle--compact",
            disabled && "is-disabled",
        )}>
            <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                className="settingsPrimitiveToggle__input"
                onChange={(event) => onChange(event.target.checked)}
            />
            <span className="settingsPrimitiveToggle__label">
                {label}
                {help ? <SettingsHelpBadge help={help} /> : null}
            </span>
        </label>
    );
}

export function SettingsFieldStack({ children, spacing = "regular" }: SettingsFieldStackProps) {
    return (
        <div className={joinClassNames(
            "settingsPrimitiveFieldStack",
            spacing === "compact" && "settingsPrimitiveFieldStack--compact",
        )}>
            {children}
        </div>
    );
}

export function SettingsSubsectionTitle({ children, actions }: SettingsSubsectionTitleProps) {
    return (
        <div className="settingsPrimitiveSubsectionTitle">
            <span>{children}</span>
            {actions ? <span className="settingsPrimitiveSubsectionTitle__actions">{actions}</span> : null}
        </div>
    );
}
