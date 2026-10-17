import type { CSSProperties, ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import { joinClassNames } from "../primitives/settingsClassNames";
import { SettingsNavigation } from "./settingsNavigation";
import "./settingsShell.css";

/** カテゴリ本文とその末尾に置く補助操作。全体の主要操作はShellのfooterへ渡す。 */
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
    /** 初期化など全カテゴリに共通する末尾操作。本文と同じ領域でスクロールする。 */
    scrollEnd?: ReactNode;
    className?: string;
    responsiveMode?: "viewport" | "container";
    navigationDensity?: "regular" | "compact";
    navigationPlacement?: "auto" | "top";
};

type SettingsShellHeaderProps = Pick<SettingsShellProps, "badge" | "title" | "description">;

/** 起動前後の設定を、固定の見出し・分類・操作とスクロール本文へ分ける。 */
export function SettingsShell({
    ariaLabel,
    badge,
    title,
    description,
    pages,
    initialPageId,
    footer,
    scrollEnd,
    className,
    responsiveMode = "viewport",
    navigationDensity = "regular",
    navigationPlacement = "auto",
}: SettingsShellProps) {
    const tabIdPrefix = useId();
    const fallbackPageId = pages[0]?.id ?? "";
    const [activePageId, setActivePageId] = useState<string>(initialPageId ?? fallbackPageId);

    useEffect(() => {
        if (!pages.some((page) => page.id === activePageId)) {
            setActivePageId(initialPageId ?? fallbackPageId);
        }
    }, [activePageId, fallbackPageId, initialPageId, pages]);

    const activePage = pages.find((page) => page.id === activePageId) ?? pages[0];
    if (!activePage) {
        return null;
    }
    const primaryPages = pages.filter((page) => page.tone !== "developer");
    const developerPages = pages.filter((page) => page.tone === "developer");
    const shellClassName = settingsShellClassName({
        className,
        responsiveMode,
        navigationDensity,
        navigationPlacement,
    });

    return (
        <section className={shellClassName} aria-label={ariaLabel}>
            <SettingsShellHeader badge={badge} title={title} description={description} />
            <SettingsShellBody
                scrollEnd={scrollEnd}
                title={title}
                tabIdPrefix={tabIdPrefix}
                primaryPages={primaryPages}
                developerPages={developerPages}
                activePage={activePage}
                onSelectPage={setActivePageId}
            />
            {footer ? <div className="settingsShell__footer">{footer}</div> : null}
        </section>
    );
}

type SettingsShellClassNameOptions = Pick<
    SettingsShellProps,
    "className" | "responsiveMode" | "navigationDensity" | "navigationPlacement"
>;

function settingsShellClassName({
    className,
    responsiveMode,
    navigationDensity,
    navigationPlacement,
}: SettingsShellClassNameOptions): string {
    return joinClassNames(
        "settingsShell",
        responsiveMode === "container" ? "is-containerResponsive" : "",
        navigationDensity === "compact" ? "settingsShell--compactNavigation" : "",
        navigationPlacement === "top" ? "settingsShell--topNavigation" : "",
        className,
    );
}

type SettingsShellBodyProps = {
    scrollEnd?: ReactNode;
    title: string;
    tabIdPrefix: string;
    primaryPages: SettingsShellPage[];
    developerPages: SettingsShellPage[];
    activePage: SettingsShellPage;
    onSelectPage: (pageId: string) => void;
};

function SettingsShellBody({
    scrollEnd,
    title,
    tabIdPrefix,
    primaryPages,
    developerPages,
    activePage,
    onSelectPage,
}: SettingsShellBodyProps) {
    return (
        <div className="settingsShell__layout">
            <SettingsNavigation
                title={title}
                pages={[...primaryPages, ...developerPages]}
                activeId={activePage.id}
                idPrefix={tabIdPrefix}
                onSelect={onSelectPage}
            />
            <SettingsShellPageDetail
                activePage={activePage}
                tabIdPrefix={tabIdPrefix}
                scrollEnd={scrollEnd}
            />
        </div>
    );
}

function SettingsShellPageDetail({
    activePage,
    tabIdPrefix,
    scrollEnd,
}: {
    scrollEnd?: ReactNode;
    activePage: SettingsShellPage;
    tabIdPrefix: string;
}) {
    return (
        <div className="settingsShell__detail">
            <div className="settingsShell__detailScroll">
                <div
                    id={getSettingsShellPanelId(tabIdPrefix, activePage.id)}
                    className="settingsShell__pageSurface"
                    role="tabpanel"
                    aria-labelledby={`${tabIdPrefix}-page-title`}
                    // biome-ignore lint/a11y/noNoninteractiveTabindex: Tabキーで操作のないカテゴリの本文にも進めるようにする。
                    tabIndex={0}
                >
                    <header className="settingsShell__pageHeader">
                        <h2 id={`${tabIdPrefix}-page-title`} className="settingsShell__pageTitle">
                            {activePage.title}
                        </h2>
                        {activePage.description ? (
                            <p className="settingsShell__pageDescription">
                                {activePage.description}
                            </p>
                        ) : null}
                    </header>
                    <div className="settingsShell__content">{activePage.content}</div>
                </div>
                {activePage.footer ? (
                    <div className="settingsShell__pageFooter">{activePage.footer}</div>
                ) : null}
                {scrollEnd}
            </div>
        </div>
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
    detail?: string;
    tone?: "neutral" | "good" | "warn";
};

type SettingsStatusStyle = CSSProperties & {
    "--settings-status-accent": string;
};

const statusToneStyles: Record<
    NonNullable<SettingsStatusCardProps["tone"]>,
    SettingsStatusStyle
> = {
    neutral: {
        "--settings-status-accent": "rgba(157, 176, 204, 0.18)",
    },
    good: {
        "--settings-status-accent": "rgba(119, 233, 168, 0.84)",
        borderColor: "rgba(119, 233, 168, 0.22)",
        background: "rgba(119, 233, 168, 0.06)",
    },
    warn: {
        "--settings-status-accent": "rgba(255, 198, 120, 0.88)",
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
