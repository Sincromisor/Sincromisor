import { SimpleVrmControlPanel } from "../simple-vrm/SimpleVrmControlPanel";

// まずは simple-vrm と同じ状態購読基盤を再利用し、vrm360 向けの見出しだけ切り替える。
export function Vrm360ControlPanel() {
    return <SimpleVrmControlPanel title="基本設定" />;
}
