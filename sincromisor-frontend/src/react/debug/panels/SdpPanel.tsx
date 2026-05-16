import type { DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { LogViewer } from "../components/LogViewer";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";

type SdpPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
};

export function SdpPanel({ snapshot, isActive }: SdpPanelProps) {
    return (
        <section
            id="debug-console-panel-sdp"
            className={debugPanelClassName("debugCard debugCard--sdp", isActive)}
            data-debug-panel="sdp"
            role="tabpanel"
            aria-labelledby="debug-console-tab-sdp"
            hidden={!isActive}
        >
            <h3>SDP</h3>
            <div className="sdpGrid">
                <LogViewer id="offerSDP" title="Offer SDP" value={snapshot.rtc.offerSdp} />
                <LogViewer id="answerSDP" title="Answer SDP" value={snapshot.rtc.answerSdp} />
            </div>
        </section>
    );
}
