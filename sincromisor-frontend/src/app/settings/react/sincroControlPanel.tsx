import { ResetSettingsButton } from "../../../features/settings/react/actions/resetSettingsButton";
import { SettingsShell } from "../../../features/settings/react/shell/settingsShell";
import { panelStyles } from "./panelStyles";
import { createSincroControlPanelPages } from "./sincroControlPanelPages";
import { useSincroPanelState } from "./useSincroPanelState";

type SincroControlPanelProps = {
    title?: string;
    variant?: "default" | "vrm360" | "looking-glass-vrm";
};

// simple-vrm / vrm360 / looking-glass-vrm 共通の常設設定パネル。
// カテゴリナビで「探す場所」と「操作する場所」を揃え、接続操作は接続ページへ集約する。
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
                initialPageId={isLookingGlassFocused ? "looking-glass" : "conversation"}
                pages={pages}
            />
            <ResetSettingsButton />
        </section>
    );
}
