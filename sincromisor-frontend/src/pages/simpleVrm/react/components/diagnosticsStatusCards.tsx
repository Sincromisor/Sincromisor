import { UI_TUNING } from "../../../../app/react/uiTuning";
import type { PanelCameraGuideState } from "../panelCameraGuideState";
import { panelStyles } from "../panelStyles";
import type {
    PanelGazeState,
    PanelLearnedVadState,
    PanelLookingGlassState,
    PanelRtcState,
} from "../panelTypes";
import { formatMaybeNumber, formatMaybeProbability } from "../panelUtils";

type DiagnosticsStatusCardsProps = {
    vadState: "unknown" | "speech" | "silence";
    gaze: PanelGazeState;
    rtcState: PanelRtcState;
    learnedVad: PanelLearnedVadState;
    lookingGlass: PanelLookingGlassState;
    cameraGuide: PanelCameraGuideState;
};

export function DiagnosticsStatusCards({
    vadState,
    gaze,
    rtcState,
    learnedVad,
    lookingGlass,
    cameraGuide,
}: DiagnosticsStatusCardsProps) {
    const diagnosticsTuning = UI_TUNING.controlPanel.diagnostics;
    const styleTuning = UI_TUNING.controlPanel.styles;
    // 生の観測値を一覧表示する領域。状態の意味づけ/合成は AppController 側で行う。
    return (
        <>
            <CameraQualityGuideCard state={cameraGuide} />
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: `repeat(${diagnosticsTuning.statusGridColumns}, minmax(0, 1fr))`,
                    gap: `${styleTuning.diagnosticsCardGapPx}px`,
                    marginBottom: `${diagnosticsTuning.sectionSpacingPx}px`,
                }}
            >
                <StatusCard label="VAD" value={vadState} />
                <StatusCard
                    label="Gaze"
                    value={gaze.watching === undefined ? "-" : gaze.watching ? "注視" : "外れ"}
                />
                <StatusCard label="顔X (faceX)" value={formatMaybeNumber(gaze.faceX)} />
                <StatusCard label="顔Y (faceY)" value={formatMaybeNumber(gaze.faceY)} />
                <StatusCard label="ICE" value={rtcState.iceConnectionState} />
                <StatusCard label="Signaling状態" value={rtcState.signalingState} />
                <StatusCard label="学習VAD" value={learnedVad.status} />
                <StatusCard
                    label="L-VAD確率"
                    value={formatMaybeProbability(learnedVad.probability)}
                />
                <StatusCard label="Looking Glass状態" value={lookingGlass.state} />
                <StatusCard label="LGコード" value={lookingGlass.code ?? "-"} />
                <StatusCard label="LG詳細" value={lookingGlass.message ?? "-"} />
            </div>
        </>
    );
}

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

type StatusCardProps = {
    label: string;
    value: string;
};

function StatusCard({ label, value }: StatusCardProps) {
    // レイアウト/色は panelStyles 側に寄せ、ここではラベルと値の構造だけを定義する。
    return (
        <div style={panelStyles.miniCard}>
            <div style={{ opacity: 0.7 }}>{label}</div>
            <div>{value}</div>
        </div>
    );
}
