import { useId } from "react";
import type { KeyboardEvent } from "react";
import "./integratedTabs.css";

export type IntegratedTabItem = {
    id: string;
    label: string;
    tone?: "default" | "developer";
};

export type IntegratedTabGroup = {
    heading?: string;
    items: IntegratedTabItem[];
};

type IntegratedTabsProps = {
    ariaLabel: string;
    groups: IntegratedTabGroup[];
    activeId: string;
    onSelect: (id: string) => void;
    className?: string;
    idPrefix?: string;
    getPanelId?: (idPrefix: string, itemId: string) => string;
};

function defaultPanelId(idPrefix: string, itemId: string): string {
    return `${idPrefix}-tabpanel-${itemId}`;
}

export function getIntegratedTabId(idPrefix: string, itemId: string): string {
    return `${idPrefix}-tab-${itemId}`;
}

export function IntegratedTabs({
    ariaLabel,
    groups,
    activeId,
    onSelect,
    className,
    idPrefix,
    getPanelId = defaultPanelId,
}: IntegratedTabsProps) {
    const generatedIdPrefix = useId();
    const resolvedIdPrefix = idPrefix ?? generatedIdPrefix;
    const visibleGroups = groups.filter((group) => group.items.length > 0);
    const items = visibleGroups.flatMap((group) => group.items);

    if (items.length === 0) {
        return null;
    }

    const selectByOffset = (offset: number): void => {
        const activeIndex = Math.max(0, items.findIndex((item) => item.id === activeId));
        const nextIndex = (activeIndex + offset + items.length) % items.length;
        onSelect(items[nextIndex]?.id ?? activeId);
    };

    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            selectByOffset(1);
        } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            selectByOffset(-1);
        } else if (event.key === "Home") {
            event.preventDefault();
            onSelect(items[0]?.id ?? activeId);
        } else if (event.key === "End") {
            event.preventDefault();
            onSelect(items[items.length - 1]?.id ?? activeId);
        }
    };

    return (
        <nav className={["integratedTabs", className ?? ""].filter(Boolean).join(" ")} aria-label={ariaLabel} role="tablist">
            {visibleGroups.map((group, groupIndex) => (
                <div key={group.heading ?? `group-${groupIndex}`} className="integratedTabs__section" role="presentation">
                    {group.heading ? <div className="integratedTabs__sectionTitle">{group.heading}</div> : null}
                    {group.items.map((item) => (
                        <button
                            key={item.id}
                            id={getIntegratedTabId(resolvedIdPrefix, item.id)}
                            type="button"
                            role="tab"
                            className={[
                                "integratedTabs__tab",
                                item.id === activeId ? "is-active" : "",
                                item.tone === "developer" ? "is-developer" : "",
                            ].filter(Boolean).join(" ")}
                            onClick={() => onSelect(item.id)}
                            onKeyDown={handleKeyDown}
                            aria-controls={getPanelId(resolvedIdPrefix, item.id)}
                            aria-selected={item.id === activeId}
                            tabIndex={item.id === activeId ? 0 : -1}
                        >
                            <span className="integratedTabs__tabLabel">{item.label}</span>
                        </button>
                    ))}
                </div>
            ))}
        </nav>
    );
}
