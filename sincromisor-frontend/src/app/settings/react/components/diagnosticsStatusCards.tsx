import { UI_TUNING } from "../../../react/uiTuning";
import type { PanelCameraGuideState } from "../panelCameraGuideState";
import { panelStyles } from "../panelStyles";

type CameraQualityGuideCardProps = {
    state: PanelCameraGuideState;
};

/**
 * tracking camera の改善案内を、CameraQualityScore が生成した文言のまま一件だけ表示する。
 *
 * 表示抑制と hysteresis は reducer の責務であり、この component は score や reason code を受け取らない。
 */
export function CameraQualityGuideCard({ state }: CameraQualityGuideCardProps) {
    if (state.message === undefined) {
        return null;
    }
    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                ...panelStyles.miniCard,
                marginBottom: `${UI_TUNING.controlPanel.diagnostics.sectionSpacingPx}px`,
                borderColor:
                    state.status === "bad"
                        ? "rgba(239, 110, 110, 0.46)"
                        : "rgba(232, 190, 92, 0.42)",
            }}
        >
            {state.message}
        </div>
    );
}
