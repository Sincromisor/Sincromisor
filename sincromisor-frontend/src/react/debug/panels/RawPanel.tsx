import type { DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { LogViewer } from "../components/LogViewer";
import { debugPanelClassName, type DebugPanelProps } from "../debugConsoleTypes";

type RawPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
};

export function RawPanel({ snapshot, isActive }: RawPanelProps) {
    return (
        <section
            id="debug-console-panel-raw"
            className={debugPanelClassName("debugCard debugCard--raw", isActive)}
            data-debug-panel="raw"
            role="tabpanel"
            aria-labelledby="debug-console-tab-raw"
            hidden={!isActive}
        >
            <h3>Raw</h3>
            <div className="sdpGrid">
                <LogViewer id="offerSDP" title="Offer SDP" value={snapshot.rtc.offerSdp} />
                <LogViewer id="answerSDP" title="Answer SDP" value={snapshot.rtc.answerSdp} />
            </div>
        </section>
    );
}
