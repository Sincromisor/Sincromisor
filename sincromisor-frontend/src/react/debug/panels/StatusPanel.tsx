import type { DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { DebugMetricGrid } from "../components/DebugMetricGrid";
import { stateClassName } from "../components/debugConsoleFormatters";
import { debugPanelClassName, type DebugPanelProps } from "../debugConsoleTypes";

type StatusPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
};

export function StatusPanel({ snapshot, isActive }: StatusPanelProps) {
    const channelState = snapshot.rtc.textChannelLog || snapshot.rtc.telopChannelLog ? "received" : "waiting";
    const gazeState = snapshot.gaze.paused ? "paused" : snapshot.gaze.status;

    return (
        <section
            id="debug-console-panel-status"
            className={debugPanelClassName("debugCard debugCard--status", isActive)}
            data-debug-panel="status"
            role="tabpanel"
            aria-labelledby="debug-console-tab-status"
            hidden={!isActive}
        >
            <h3>Status</h3>
            <div className="debugSummaryGrid">
                <DebugMetricGrid
                    className="statusGrid"
                    items={[
                        { label: "ICE Connection", value: snapshot.rtc.iceConnectionState, valueClassName: stateClassName(snapshot.rtc.iceConnectionState) },
                        { label: "Signaling", value: snapshot.rtc.signalingState, valueClassName: stateClassName(snapshot.rtc.signalingState) },
                        { label: "Round Trip Time", value: snapshot.rtc.metrics.rtcRoundTripTime },
                        { label: "Mic Level", value: `${Math.round(snapshot.audio.localLevel * 100)}%` },
                        { label: "Remote Audio", value: `${Math.round(snapshot.audio.remoteLevel * 100)}%` },
                        { label: "Local VAD", value: snapshot.audio.localVadIsSpeech ? "Speech" : "Silence", valueClassName: snapshot.audio.localVadIsSpeech ? "state-ok" : "" },
                        { label: "Gaze", value: gazeState },
                        { label: "DataChannel", value: channelState, valueClassName: channelState === "received" ? "state-ok" : "" },
                        { label: "Candidate", value: snapshot.rtc.metrics.rtcCandidatePair },
                    ]}
                />
            </div>
        </section>
    );
}
