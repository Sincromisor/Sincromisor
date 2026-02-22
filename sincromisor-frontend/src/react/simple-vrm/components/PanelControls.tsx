import { panelStyles } from "../panelStyles";
import { UI_TUNING } from "../../app/uiTuning";

type PanelControlsProps = {
    hasActiveController: boolean;
    onStart: () => void;
    onStop: () => void;
};

// Start/Stop は AppController に委譲し、この component はボタン表示だけを担当する。
export function PanelControls({ hasActiveController, onStart, onStop }: PanelControlsProps) {
    const styleTuning = UI_TUNING.controlPanel.styles;
    return (
        <div style={{ display: "flex", gap: `${styleTuning.controlsGapPx}px` }}>
            <button type="button" onClick={onStart} disabled={!hasActiveController} style={panelStyles.button}>
                開始
            </button>
            <button type="button" onClick={onStop} disabled={!hasActiveController} style={panelStyles.button}>
                停止
            </button>
        </div>
    );
}
