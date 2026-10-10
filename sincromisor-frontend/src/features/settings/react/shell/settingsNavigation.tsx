import { useLayoutEffect, useRef, useState } from "react";
import { IntegratedTabs } from "../../../../app/shell/react/integratedTabs/integratedTabs";
import type { SettingsShellPage } from "./settingsShell";

type SettingsNavigationProps = {
    title: string;
    pages: SettingsShellPage[];
    activeId: string;
    idPrefix: string;
    onSelect: (id: string) => void;
};

/** 実際のラベル幅が収まらないときだけ選択欄に切り替え、起動前後で同じ判定を使う。 */
export function SettingsNavigation({
    title,
    pages,
    activeId,
    idPrefix,
    onSelect,
}: SettingsNavigationProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);
    const [compact, setCompact] = useState(false);
    useLayoutEffect(() => {
        const root = rootRef.current;
        const tabs = tabsRef.current;
        if (!root || !tabs) return;
        // 選択欄表示中もタブの自然幅を測れるよう、測定対象は描画したまま非表示にする。
        const measure = () => setCompact(tabs.scrollWidth > root.clientWidth);
        const observer = new ResizeObserver(measure);
        observer.observe(root);
        observer.observe(tabs);
        measure();
        return () => observer.disconnect();
    }, []);
    const panelId = `${idPrefix}-settings-shell-panel-${activeId}`;
    return (
        <div ref={rootRef} className={`settingsShell__navigation${compact ? " is-compact" : ""}`}>
            <div
                ref={tabsRef}
                className="settingsShell__measuredTabs"
                aria-hidden={compact}
                inert={compact}
            >
                <IntegratedTabs
                    className="settingsShell__nav"
                    ariaLabel={`${title} カテゴリ`}
                    groups={[{ items: pages }]}
                    activeId={activeId}
                    onSelect={onSelect}
                    idPrefix={idPrefix}
                    getPanelId={(prefix, id) => `${prefix}-settings-shell-panel-${id}`}
                />
            </div>
            {compact ? (
                <label className="settingsShell__navSelectLabel">
                    <span>カテゴリ</span>
                    <select
                        className="settingsShell__navSelect"
                        aria-label={`${title} カテゴリ`}
                        aria-controls={panelId}
                        value={activeId}
                        onChange={(event) => onSelect(event.currentTarget.value)}
                    >
                        {pages.map((page) => (
                            <option key={page.id} value={page.id}>
                                {page.label}
                            </option>
                        ))}
                    </select>
                </label>
            ) : null}
        </div>
    );
}
