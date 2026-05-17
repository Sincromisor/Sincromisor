import type { ReactNode } from "react";
import { joinClassNames } from "./settingsClassNames";

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

type SettingsFieldStackProps = {
    children: ReactNode;
    spacing?: "compact" | "regular";
};

type SettingsSubsectionTitleProps = {
    children: ReactNode;
    actions?: ReactNode;
};

export function SettingsHint({ children, tone = "muted", className }: SettingsHintProps) {
    return (
        <div
            className={joinClassNames(
                "settingsPrimitiveHint",
                `settingsPrimitiveHint--${tone}`,
                className,
            )}
        >
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
                    {title ? (
                        <div className="settingsPrimitiveSectionCard__title">{title}</div>
                    ) : null}
                    {description ? (
                        <div className="settingsPrimitiveSectionCard__description">
                            {description}
                        </div>
                    ) : null}
                </div>
            ) : null}
            <div className="settingsPrimitiveSectionCard__body">{children}</div>
        </section>
    );
}

export function SettingsFieldStack({ children, spacing = "regular" }: SettingsFieldStackProps) {
    return (
        <div
            className={joinClassNames(
                "settingsPrimitiveFieldStack",
                spacing === "compact" && "settingsPrimitiveFieldStack--compact",
            )}
        >
            {children}
        </div>
    );
}

export function SettingsSubsectionTitle({ children, actions }: SettingsSubsectionTitleProps) {
    return (
        <div className="settingsPrimitiveSubsectionTitle">
            <span>{children}</span>
            {actions ? (
                <span className="settingsPrimitiveSubsectionTitle__actions">{actions}</span>
            ) : null}
        </div>
    );
}
