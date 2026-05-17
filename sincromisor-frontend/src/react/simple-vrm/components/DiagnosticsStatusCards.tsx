import { UI_TUNING } from "../../app/uiTuning";
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
};

export function DiagnosticsStatusCards({
    vadState,
    gaze,
    rtcState,
    learnedVad,
    lookingGlass,
}: DiagnosticsStatusCardsProps) {
    const diagnosticsTuning = UI_TUNING.controlPanel.diagnostics;
    const styleTuning = UI_TUNING.controlPanel.styles;
    // 生の観測値を一覧表示する領域。状態の意味づけ/合成は AppController 側で行う。
    return (
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
            <StatusCard label="L-VAD確率" value={formatMaybeProbability(learnedVad.probability)} />
            <StatusCard label="Looking Glass状態" value={lookingGlass.state} />
            <StatusCard label="LGコード" value={lookingGlass.code || "-"} />
            <StatusCard label="LG詳細" value={lookingGlass.message || "-"} />
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
