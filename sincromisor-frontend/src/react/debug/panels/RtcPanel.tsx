import type { DebugConsoleSnapshot } from "../../../ts/UI/DebugConsoleManager";
import { DebugMetricGrid } from "../components/DebugMetricGrid";
import { stateClassName } from "../components/debugConsoleFormatters";
import { TrendGraph } from "../components/TrendGraph";
import { type DebugPanelProps, debugPanelClassName } from "../debugConsoleTypes";

type RtcPanelProps = DebugPanelProps & {
    snapshot: DebugConsoleSnapshot;
};

export function RtcPanel({ snapshot, isActive }: RtcPanelProps) {
    return (
        <section
            id="debug-console-panel-rtc"
            className={debugPanelClassName("debugCard debugCard--rtc", isActive)}
            data-debug-panel="rtc"
            role="tabpanel"
            aria-labelledby="debug-console-tab-rtc"
            hidden={!isActive}
        >
            <h3>RTC</h3>
            <DebugMetricGrid
                items={[
                    {
                        label: "ICE Gathering",
                        value: snapshot.rtc.iceGatheringState,
                        valueClassName: stateClassName(snapshot.rtc.iceGatheringState),
                    },
                    {
                        label: "ICE Connection",
                        value: snapshot.rtc.iceConnectionState,
                        valueClassName: stateClassName(snapshot.rtc.iceConnectionState),
                    },
                    {
                        label: "Signaling",
                        value: snapshot.rtc.signalingState,
                        valueClassName: stateClassName(snapshot.rtc.signalingState),
                    },
                    { label: "Round Trip Time", value: snapshot.rtc.metrics.rtcRoundTripTime },
                    {
                        label: "Available Out Bitrate",
                        value: snapshot.rtc.metrics.rtcAvailableOutgoingBitrate,
                    },
                    { label: "Selected Candidate", value: snapshot.rtc.metrics.rtcCandidatePair },
                    {
                        label: "Transport Protocol",
                        value: snapshot.rtc.metrics.rtcTransportProtocol,
                    },
                    { label: "Local Endpoint", value: snapshot.rtc.metrics.rtcLocalCandidate },
                    { label: "Remote Endpoint", value: snapshot.rtc.metrics.rtcRemoteCandidate },
                    {
                        label: "Outbound Audio Bitrate",
                        value: snapshot.rtc.metrics.outboundAudioBitrate,
                    },
                    {
                        label: "Inbound Audio Bitrate",
                        value: snapshot.rtc.metrics.inboundAudioBitrate,
                    },
                    {
                        label: "Outbound Packets Sent",
                        value: snapshot.rtc.metrics.outboundPacketsSent,
                    },
                    {
                        label: "Inbound Packets Lost",
                        value: snapshot.rtc.metrics.inboundPacketsLost,
                    },
                    {
                        label: "Inbound Packet Loss",
                        value: snapshot.rtc.metrics.inboundPacketLossRate,
                    },
                    { label: "Inbound Jitter", value: snapshot.rtc.metrics.inboundJitter },
                ]}
            />
            <div className="trendGrid">
                <TrendGraph
                    snapshot={snapshot}
                    trendKey="trendOutboundAudioBitrate"
                    id="trendOutboundAudioBitrate"
                    title="Outbound Bitrate (60s / max 256 kbps)"
                />
                <TrendGraph
                    snapshot={snapshot}
                    trendKey="trendInboundAudioBitrate"
                    id="trendInboundAudioBitrate"
                    title="Inbound Bitrate (60s / max 256 kbps)"
                />
                <TrendGraph
                    snapshot={snapshot}
                    trendKey="trendRoundTripTime"
                    id="trendRoundTripTime"
                    title="RTT (60s / max 200 ms)"
                />
                <TrendGraph
                    snapshot={snapshot}
                    trendKey="trendInboundPacketLossRate"
                    id="trendInboundPacketLossRate"
                    title="Inbound Loss Rate (60s / max 5%)"
                />
            </div>
        </section>
    );
}
