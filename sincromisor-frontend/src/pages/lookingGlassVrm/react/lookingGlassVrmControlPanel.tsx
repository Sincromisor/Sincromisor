import { SincroControlPanel } from "../../../app/settings/react/sincroControlPanel";

// Looking Glass 専用ページでは、共通パネルを再利用しつつ variant で UI配置だけ最適化する。
export function LookingGlassVrmControlPanel() {
    return <SincroControlPanel title="Looking Glass" variant="looking-glass-vrm" />;
}
