import { SimpleVrmControlPanel } from "../simple-vrm/SimpleVrmControlPanel";

// Looking Glass 専用ページでは、共通パネルを再利用しつつ variant で UI配置だけ最適化する。
export function LookingGlassVrmControlPanel() {
    return <SimpleVrmControlPanel title="Looking Glass" variant="looking-glass-vrm" />;
}
