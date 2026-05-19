import { SettingsShell } from "../../../features/settings/react/shell/settingsShell";
import { panelStyles } from "./panelStyles";
import { createSimpleVrmControlPanelPages } from "./simpleVrmControlPanelPages";
import { useSimpleVrmPanelState } from "./useSimpleVrmPanelState";

type SimpleVrmControlPanelProps = {
    title?: string;
    variant?: "default" | "vrm360" | "looking-glass-vrm";
};

// simple-vrm / vrm360 / looking-glass-vrm 共通の常設設定パネル。
// カテゴリナビで「探す場所」と「操作する場所」を揃え、接続操作は接続ページへ集約する。
export function SimpleVrmControlPanel({
    title = "基本設定",
    variant = "default",
}: SimpleVrmControlPanelProps) {
    const panelState = useSimpleVrmPanelState();
    const isLookingGlassFocused = variant === "looking-glass-vrm";
    const pages = createSimpleVrmControlPanelPages({
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
        </section>
    );
}
