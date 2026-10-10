import type { KeyboardEvent } from "react";
import { useId } from "react";
import "./integratedTabs.css";

/** タブの識別子と表示名。内容の描画は呼び出し元が所有する。 */
export type IntegratedTabItem = {
    id: string;
    label: string;
    tone?: "default" | "developer";
};

/** 見出し付きのタブ分類。キー移動は分類をまたいで循環する。 */
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

/** タブと対応する内容を結ぶ一意なDOM識別子を作る。 */
export function getIntegratedTabId(idPrefix: string, itemId: string): string {
    return `${idPrefix}-tab-${itemId}`;
}

/** 選択とフォーカスを連動させる、設定・診断共通のタブ一覧。 */
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
    const handleKeyDown = createIntegratedTabKeyHandler({
        activeId,
        items,
        onSelect: (id) => {
            onSelect(id);
            document.getElementById(getIntegratedTabId(resolvedIdPrefix, id))?.focus();
        },
    });

    return (
        <div
            className={["integratedTabs", className ?? ""].filter(Boolean).join(" ")}
            aria-label={ariaLabel}
            role="tablist"
        >
            {visibleGroups.map((group, groupIndex) => (
                <IntegratedTabGroupSection
                    key={group.heading ?? `group-${groupIndex}`}
                    group={group}
                    activeId={activeId}
                    idPrefix={resolvedIdPrefix}
                    getPanelId={getPanelId}
                    onSelect={onSelect}
                    onKeyDown={handleKeyDown}
                />
            ))}
        </div>
    );
}

type IntegratedTabKeyHandlerOptions = Pick<IntegratedTabsProps, "activeId" | "onSelect"> & {
    items: IntegratedTabItem[];
};

function createIntegratedTabKeyHandler({
    activeId,
    items,
    onSelect,
}: IntegratedTabKeyHandlerOptions): (event: KeyboardEvent<HTMLButtonElement>) => void {
    const selectByOffset = (offset: number): void => {
        const activeIndex = Math.max(
            0,
            items.findIndex((item) => item.id === activeId),
        );
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
    return handleKeyDown;
}

type IntegratedTabGroupSectionProps = {
    group: IntegratedTabGroup;
    activeId: string;
    idPrefix: string;
    getPanelId: NonNullable<IntegratedTabsProps["getPanelId"]>;
    onSelect: (id: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

function IntegratedTabGroupSection({
    group,
    activeId,
    idPrefix,
    getPanelId,
    onSelect,
    onKeyDown,
}: IntegratedTabGroupSectionProps) {
    return (
        <div className="integratedTabs__section" role="presentation">
            {group.heading ? (
                <div className="integratedTabs__sectionTitle">{group.heading}</div>
            ) : null}
            {group.items.map((item) => (
                <IntegratedTabButton
                    key={item.id}
                    item={item}
                    idPrefix={idPrefix}
                    activeId={activeId}
                    getPanelId={getPanelId}
                    onSelect={onSelect}
                    onKeyDown={onKeyDown}
                />
            ))}
        </div>
    );
}

type IntegratedTabButtonProps = {
    item: IntegratedTabItem;
    idPrefix: string;
    activeId: string;
    getPanelId: NonNullable<IntegratedTabsProps["getPanelId"]>;
    onSelect: (id: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
};

function IntegratedTabButton({
    item,
    idPrefix,
    activeId,
    getPanelId,
    onSelect,
    onKeyDown,
}: IntegratedTabButtonProps) {
    const isActive = item.id === activeId;
    return (
        <button
            id={getIntegratedTabId(idPrefix, item.id)}
            type="button"
            role="tab"
            className={[
                "integratedTabs__tab",
                isActive ? "is-active" : "",
                item.tone === "developer" ? "is-developer" : "",
            ]
                .filter(Boolean)
                .join(" ")}
            onClick={() => onSelect(item.id)}
            onKeyDown={onKeyDown}
            aria-controls={getPanelId(idPrefix, item.id)}
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
        >
            <span className="integratedTabs__tabLabel">{item.label}</span>
        </button>
    );
}
