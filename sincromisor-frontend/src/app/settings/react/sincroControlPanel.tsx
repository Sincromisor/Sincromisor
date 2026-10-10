import { SettingsShell } from "../../../features/settings/react/shell/settingsShell";
import { panelStyles } from "./panelStyles";
import { ConnectionSettingsPage } from "./sincroConnectionPage";
import { createSincroControlPanelPages } from "./sincroControlPanelPages";
import { useSincroPanelState } from "./useSincroPanelState";

type SincroControlPanelProps = {
    title?: string;
    variant?: "default" | "vrm360" | "looking-glass-vrm";
};

/** 3ページ共通の常設設定。接続状態と開始・停止は分類本文から独立して固定表示する。 */
export function SincroControlPanel({
    title = "基本設定",
    variant = "default",
}: SincroControlPanelProps) {
    const panelState = useSincroPanelState();
    const isLookingGlassFocused = variant === "looking-glass-vrm";
    const pages = createSincroControlPanelPages({
        panelState,
        isLookingGlassFocused,
    });

    return (
        <section aria-label="基本設定" className="sincroControlPanel" style={panelStyles.root}>
            <SettingsShell
                ariaLabel="一般ユーザー向け設定"
                title={title}
                responsiveMode="container"
                navigationDensity="compact"
                navigationPlacement="top"
                initialPageId="experience"
                pages={pages}
                footer={<ConnectionSettingsPage panelState={panelState} />}
            />
        </section>
    );
}
