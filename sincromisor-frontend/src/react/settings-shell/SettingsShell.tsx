import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import "./settingsShell.css";

export type SettingsShellPage = {
    id: string;
    label: string;
    title: string;
    description: string;
    content: ReactNode;
    summary?: ReactNode;
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
}: SettingsShellProps) {
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
        <section className="settingsShell" aria-label={ariaLabel}>
            <SettingsShellHeader badge={badge} title={title} description={description} />
            <div className="settingsShell__layout">
                <nav className="settingsShell__nav" aria-label={`${title} カテゴリ`}>
                    <SettingsShellNavGroup
                        pages={primaryPages}
                        activePageId={activePage.id}
                        onSelectPage={setActivePageId}
                    />
                    {developerPages.length > 0 ? (
                        <SettingsShellNavGroup
                            heading="開発者向け"
                            pages={developerPages}
                            activePageId={activePage.id}
                            onSelectPage={setActivePageId}
                        />
                    ) : null}
                </nav>
                <div className="settingsShell__detail">
                    <div className="settingsShell__pageSurface">
                        <header className="settingsShell__pageHeader">
                            <h2 className="settingsShell__pageTitle">{activePage.title}</h2>
                            <p className="settingsShell__pageDescription">{activePage.description}</p>
                        </header>
                        {activePage.summary ? (
                            <div className="settingsShell__summary">{activePage.summary}</div>
                        ) : null}
                        <div className="settingsShell__content">{activePage.content}</div>
                    </div>
                    {activePage.footer ? (
                        <div className="settingsShell__pageFooter">{activePage.footer}</div>
                    ) : null}
                </div>
            </div>
            {footer ? <div className="settingsShell__footer">{footer}</div> : null}
        </section>
    );
}

type SettingsShellNavGroupProps = {
    heading?: string;
    pages: SettingsShellPage[];
    activePageId: string;
    onSelectPage: (pageId: string) => void;
};

function SettingsShellNavGroup({
    heading,
    pages,
    activePageId,
    onSelectPage,
}: SettingsShellNavGroupProps) {
    if (pages.length === 0) {
        return null;
    }
    return (
        <div className="settingsShell__navSection">
            {heading ? <div className="settingsShell__navSectionTitle">{heading}</div> : null}
            {pages.map((page) => (
                <button
                    key={page.id}
                    type="button"
                    className={`settingsShell__navButton${page.id === activePageId ? " is-active" : ""}${page.tone === "developer" ? " is-developer" : ""}`}
                    onClick={() => onSelectPage(page.id)}
                    aria-current={page.id === activePageId ? "page" : undefined}
                >
                    <span className="settingsShell__navButtonLabel">{page.label}</span>
                </button>
            ))}
        </div>
    );
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
    neutral: {},
    good: {
        borderColor: "rgba(119, 233, 168, 0.28)",
        background: "linear-gradient(180deg, rgba(59, 110, 82, 0.32), rgba(19, 31, 25, 0.42))",
    },
    warn: {
        borderColor: "rgba(255, 198, 120, 0.34)",
        background: "linear-gradient(180deg, rgba(110, 80, 39, 0.34), rgba(37, 25, 18, 0.46))",
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
