import { UI_TUNING } from "../../app/uiTuning";
import { panelStyles } from "../panelStyles";
import type { PanelMessageLog, PanelTelopLog } from "../panelTypes";

type DiagnosticsLogSectionsProps = {
    rtcEvents: string[];
    telopLogs: PanelTelopLog[];
    messageLogs: PanelMessageLog[];
};

function logKey(base: string, seenCounts: Map<string, number>): string {
    const count = seenCounts.get(base) ?? 0;
    seenCounts.set(base, count + 1);
    return `${base}-${count}`;
}

export function DiagnosticsLogSections({
    rtcEvents,
    telopLogs,
    messageLogs,
}: DiagnosticsLogSectionsProps) {
    const diagnosticsTuning = UI_TUNING.controlPanel.diagnostics;
    const rtcEventKeyCounts = new Map<string, number>();
    const telopLogKeyCounts = new Map<string, number>();
    const messageLogKeyCounts = new Map<string, number>();
    // 直近数件のみを表示し、常時表示しても画面占有が増えすぎないようにしている。
    return (
        <>
            <SectionTitle title="最近のRTCイベント" />
            <div
                style={{
                    display: "grid",
                    gap: `${diagnosticsTuning.sectionGapPx}px`,
                    marginBottom: `${diagnosticsTuning.sectionSpacingPx}px`,
                }}
            >
                {rtcEvents.length === 0 ? (
                    <EmptyLine text="RTCイベントはまだありません" />
                ) : (
                    rtcEvents.map((line) => (
                        <div key={logKey(line, rtcEventKeyCounts)} style={panelStyles.miniLog}>
                            {line}
                        </div>
                    ))
                )}
            </div>

            <SectionTitle title="最近のテロップ" />
            <div
                style={{
                    display: "grid",
                    gap: `${diagnosticsTuning.sectionGapPx}px`,
                    marginBottom: `${diagnosticsTuning.sectionSpacingPx}px`,
                }}
            >
                {telopLogs.length === 0 ? (
                    <EmptyLine text="テロップはまだありません" />
                ) : (
                    telopLogs.map((item) => (
                        <div
                            key={logKey(
                                `${item.message}-${item.text}-${item.vowel}`,
                                telopLogKeyCounts,
                            )}
                            style={panelStyles.miniLog}
                        >
                            <div style={{ opacity: 0.7 }}>
                                {item.newText ? "new_text" : "continue"} / 母音:
                                {item.vowel === undefined || item.vowel === "" ? "-" : item.vowel}
                            </div>
                            <div>{item.message}</div>
                            {item.text ? (
                                <div style={{ opacity: 0.85 }}>テキスト (text): {item.text}</div>
                            ) : null}
                        </div>
                    ))
                )}
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
                ) : (
                    messageLogs.map((log) => (
                        <div
                            key={logKey(`${log.kind}-${log.text}`, messageLogKeyCounts)}
                            style={{
                                ...panelStyles.miniLog,
                                background:
                                    log.kind === "error_message"
                                        ? "rgba(220, 70, 70, 0.2)"
                                        : "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.08)",
                            }}
                        >
                            <div style={{ opacity: 0.7 }}>{log.kind}</div>
                            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                {log.text}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </>
    );
}

function SectionTitle({ title }: { title: string }) {
    // 余白値は UI_TUNING から取得し、Control Panel 全体の spacing を一箇所で調整できるようにする。
    const styleTuning = UI_TUNING.controlPanel.styles;
    return (
        <div
            style={{
                opacity: 0.75,
                marginBottom: `${styleTuning.diagnosticsSectionTitleMarginBottomPx}px`,
            }}
        >
            {title}
        </div>
    );
}

function EmptyLine({ text }: { text: string }) {
    // 各セクションの空状態表示を統一する小部品。
    return <div style={{ opacity: 0.55 }}>{text}</div>;
}
