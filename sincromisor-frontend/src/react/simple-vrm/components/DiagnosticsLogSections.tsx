import { panelStyles } from "../panelStyles";
import type { PanelMessageLog, PanelTelopLog } from "../panelTypes";
import { UI_TUNING } from "../../app/uiTuning";

type DiagnosticsLogSectionsProps = {
    rtcEvents: string[];
    telopLogs: PanelTelopLog[];
    messageLogs: PanelMessageLog[];
};

export function DiagnosticsLogSections({ rtcEvents, telopLogs, messageLogs }: DiagnosticsLogSectionsProps) {
    const diagnosticsTuning = UI_TUNING.controlPanel.diagnostics;
    // 直近数件のみを表示し、常時表示しても画面占有が増えすぎないようにしている。
    return (
        <>
            <SectionTitle title="最近のRTCイベント" />
            <div style={{ display: "grid", gap: `${diagnosticsTuning.sectionGapPx}px`, marginBottom: `${diagnosticsTuning.sectionSpacingPx}px` }}>
                {rtcEvents.length === 0 ? (
                    <EmptyLine text="RTCイベントはまだありません" />
                ) : rtcEvents.map((line, index) => (
                    <div key={`${index}-${line.slice(0, 12)}`} style={panelStyles.miniLog}>{line}</div>
                ))}
            </div>

            <SectionTitle title="最近のテロップ" />
            <div style={{ display: "grid", gap: `${diagnosticsTuning.sectionGapPx}px`, marginBottom: `${diagnosticsTuning.sectionSpacingPx}px` }}>
                {telopLogs.length === 0 ? (
                    <EmptyLine text="テロップはまだありません" />
                ) : telopLogs.map((item, index) => (
                    <div key={`${index}-${item.message.slice(0, 10)}-${item.text.slice(0, 4)}`} style={panelStyles.miniLog}>
                        <div style={{ opacity: 0.7 }}>
                            {item.newText ? "new_text" : "continue"} / 母音:{item.vowel || "-"}
                        </div>
                        <div>{item.message}</div>
                        {item.text ? <div style={{ opacity: 0.85 }}>テキスト (text): {item.text}</div> : null}
                    </div>
                ))}
            </div>

            <SectionTitle title="最近のメッセージ" />
            <div
                style={{
                    display: "grid",
                    gap: `${diagnosticsTuning.sectionGapPx}px`,
                    maxHeight: `${diagnosticsTuning.messageLogMaxHeightPx}px`,
                    // 長いログでもパネル全体の高さを押し広げないよう、ここだけ内側スクロールにする。
                    overflow: "auto",
                }}
            >
                {messageLogs.length === 0 ? (
                    <EmptyLine text="メッセージはまだありません" />
                ) : messageLogs.map((log, index) => (
                    <div
                        key={`${log.kind}-${index}-${log.text.slice(0, 12)}`}
                        style={{
                            ...panelStyles.miniLog,
                            background: log.kind === "error_message"
                                ? "rgba(220, 70, 70, 0.2)"
                                : "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.08)",
                        }}
                    >
                        <div style={{ opacity: 0.7 }}>{log.kind}</div>
                        <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{log.text}</div>
                    </div>
                ))}
            </div>
        </>
    );
}

function SectionTitle({ title }: { title: string }) {
    // 余白値は UI_TUNING から取得し、Control Panel 全体の spacing を一箇所で調整できるようにする。
    const styleTuning = UI_TUNING.controlPanel.styles;
    return <div style={{ opacity: 0.75, marginBottom: `${styleTuning.diagnosticsSectionTitleMarginBottomPx}px` }}>{title}</div>;
}

function EmptyLine({ text }: { text: string }) {
    // 各セクションの空状態表示を統一する小部品。
    return <div style={{ opacity: 0.55 }}>{text}</div>;
}
