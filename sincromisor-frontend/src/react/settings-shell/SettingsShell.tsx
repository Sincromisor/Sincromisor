import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { getIntegratedTabId, IntegratedTabs } from "../integrated-tabs/IntegratedTabs";
import "./settingsShell.css";

export type SettingsShellPage = {
    id: string;
    label: string;
    title: string;
    description?: string;
    content: ReactNode;
    footer?: ReactNode;
    tone?: "default" | "developer";
};

type SettingsShellProps = {
    ariaLabel: string;
    badge?: string;
    title: string;
    description?: string;
    pages: SettingsShellPage[];
    initialPageId?: string;
    footer?: ReactNode;
    responsiveMode?: "viewport" | "container";
    navigationDensity?: "regular" | "compact";
    navigationPlacement?: "auto" | "top";
};

type SettingsShellHeaderProps = Pick<SettingsShellProps, "badge" | "title" | "description">;

export function SettingsShell({
    ariaLabel,
    badge,
    title,
    description,
    pages,
    initialPageId,
    footer,
    responsiveMode = "viewport",
    navigationDensity = "regular",
    navigationPlacement = "auto",
}: SettingsShellProps) {
    const tabIdPrefix = useId();
    const visiblePages = useMemo(() => pages, [pages]);
    const fallbackPageId = visiblePages[0]?.id ?? "";
    const [activePageId, setActivePageId] = useState<string>(initialPageId ?? fallbackPageId);

    useEffect(() => {
        if (!visiblePages.some((page) => page.id === activePageId)) {
            setActivePageId(initialPageId ?? fallbackPageId);
        }
    }, [activePageId, fallbackPageId, initialPageId, visiblePages]);

    const activePage = visiblePages.find((page) => page.id === activePageId) ?? visiblePages[0];
    if (!activePage) {
        return null;
    }
    const primaryPages = visiblePages.filter((page) => page.tone !== "developer");
    const developerPages = visiblePages.filter((page) => page.tone === "developer");

    return (
        <section
            className={[
                "settingsShell",
                responsiveMode === "container" ? "is-containerResponsive" : "",
                navigationDensity === "compact" ? "settingsShell--compactNavigation" : "",
                navigationPlacement === "top" ? "settingsShell--topNavigation" : "",
            ].filter(Boolean).join(" ")}
            aria-label={ariaLabel}
        >
            <SettingsShellHeader badge={badge} title={title} description={description} />
            <div className="settingsShell__layout">
                <SettingsShellNavSelect
                    title={title}
                    primaryPages={primaryPages}
                    developerPages={developerPages}
                    activePageId={activePage.id}
                    onSelectPage={setActivePageId}
                />
                <IntegratedTabs
                    className="settingsShell__nav"
                    ariaLabel={`${title} カテゴリ`}
                    groups={[
                        { items: primaryPages },
                        ...(developerPages.length > 0 ? [{ heading: "開発者向け", items: developerPages }] : []),
                    ]}
                    activeId={activePage.id}
                    onSelect={setActivePageId}
                    idPrefix={tabIdPrefix}
                    getPanelId={getSettingsShellPanelId}
                />
                <div className="settingsShell__detail">
                    <div className="settingsShell__detailScroll">
                        <div
                            id={getSettingsShellPanelId(tabIdPrefix, activePage.id)}
                            className="settingsShell__pageSurface"
                            role="tabpanel"
                            aria-labelledby={getIntegratedTabId(tabIdPrefix, activePage.id)}
                        >
                            <header className="settingsShell__pageHeader">
                                <h2 className="settingsShell__pageTitle">{activePage.title}</h2>
                                {activePage.description ? (
                                    <p className="settingsShell__pageDescription">{activePage.description}</p>
                                ) : null}
                            </header>
                            <div className="settingsShell__content">{activePage.content}</div>
                        </div>
                        {activePage.footer ? (
                            <div className="settingsShell__pageFooter">{activePage.footer}</div>
                        ) : null}
                    </div>
                </div>
            </div>
            {footer ? <div className="settingsShell__footer">{footer}</div> : null}
        </section>
    );
}

type SettingsShellNavSelectProps = {
    title: string;
    primaryPages: SettingsShellPage[];
    developerPages: SettingsShellPage[];
    activePageId: string;
    onSelectPage: (pageId: string) => void;
};

function SettingsShellNavSelect({
    title,
    primaryPages,
    developerPages,
    activePageId,
    onSelectPage,
}: SettingsShellNavSelectProps) {
    const hasDeveloperPages = developerPages.length > 0;

    return (
        <label className="settingsShell__navSelectLabel">
            <span className="settingsShell__navSelectText">カテゴリ</span>
            <select
                className="settingsShell__navSelect"
                aria-label={`${title} カテゴリ`}
                value={activePageId}
                onChange={(event) => onSelectPage(event.currentTarget.value)}
            >
                {primaryPages.map((page) => (
                    <option key={page.id} value={page.id}>
                        {page.label}
                    </option>
                ))}
                {hasDeveloperPages ? (
                    <optgroup label="開発者向け">
                        {developerPages.map((page) => (
                            <option key={page.id} value={page.id}>
                                {page.label}
                            </option>
                        ))}
                    </optgroup>
                ) : null}
            </select>
        </label>
    );
}

function getSettingsShellPanelId(prefix: string, pageId: string): string {
    return `${prefix}-settings-shell-panel-${pageId}`;
}

function SettingsShellHeader({ badge, title, description }: SettingsShellHeaderProps) {
    return (
        <header className="settingsShell__header">
            <div>
                {badge ? <div className="settingsShell__badge">{badge}</div> : null}
                <div className="settingsShell__title">{title}</div>
                {description ? <p className="settingsShell__description">{description}</p> : null}
            </div>
        </header>
    );
}

type SettingsSummaryGridProps = {
    children: ReactNode;
};

export function SettingsSummaryGrid({ children }: SettingsSummaryGridProps) {
    return <div className="settingsShell__summaryGrid">{children}</div>;
}

type SettingsStatusCardProps = {
    label: string;
    value: string;
    detail?: string | null;
    tone?: "neutral" | "good" | "warn";
};

const statusToneStyles: Record<NonNullable<SettingsStatusCardProps["tone"]>, CSSProperties> = {
    neutral: {
        ["--settings-status-accent" as string]: "rgba(157, 176, 204, 0.18)",
    },
    good: {
        ["--settings-status-accent" as string]: "rgba(119, 233, 168, 0.84)",
        borderColor: "rgba(119, 233, 168, 0.22)",
        background: "rgba(119, 233, 168, 0.06)",
    },
    warn: {
        ["--settings-status-accent" as string]: "rgba(255, 198, 120, 0.88)",
        borderColor: "rgba(255, 198, 120, 0.24)",
        background: "rgba(255, 198, 120, 0.06)",
    },
};

export function SettingsStatusCard({
    label,
    value,
    detail,
    tone = "neutral",
}: SettingsStatusCardProps) {
    return (
        <div className="settingsShell__statusCard" style={statusToneStyles[tone]}>
            <div className="settingsShell__statusLabel">{label}</div>
            <div className="settingsShell__statusValue">{value}</div>
            {detail ? <div className="settingsShell__statusDetail">{detail}</div> : null}
        </div>
    );
}
