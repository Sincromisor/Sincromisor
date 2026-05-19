import type { DebugConsoleManager } from "../ui/debugConsoleManager";
import { normalizeRtcStatsRecord, type RtcStatsRecord } from "./rtcStatsRecords";

type RtcByteCounter = { bytes: number; timestamp: number };

type RtcBitrateResult = {
    bitrate: number | undefined;
    next: RtcByteCounter | undefined;
};

// RTCStatsReport をデバッグ UI の metric/trend 表示へ変換する。
// RTCTalkClient 本体は接続制御に集中させ、統計の差分計算と表示文字列化をここへ閉じる。
export class RtcStatsReporter {
    private previousOutboundAudio: RtcByteCounter | undefined;
    private previousInboundAudio: RtcByteCounter | undefined;
    private currentRouteSignature?: string;

    constructor(
        private readonly logger: Pick<
            DebugConsoleManager,
            "addRtcEventLog" | "pushTrendPoint" | "updateMetricValue"
        >,
    ) {}

    reset(): void {
        this.previousOutboundAudio = undefined;
        this.previousInboundAudio = undefined;
        this.currentRouteSignature = undefined;
    }

    async collectAndRender(peerConnection: RTCPeerConnection): Promise<void> {
        const report = await peerConnection.getStats();
        const summary = collectRtcStatsSummary(report);
        const outboundResult = calcBitrate(
            summary.outboundAudio?.bytesSent,
            summary.outboundAudio?.timestamp,
            this.previousOutboundAudio,
        );
        this.previousOutboundAudio = outboundResult.next;
        this.renderOutboundAudio(summary.outboundAudio, outboundResult.bitrate);

        const inboundResult = calcBitrate(
            summary.inboundAudio?.bytesReceived,
            summary.inboundAudio?.timestamp,
            this.previousInboundAudio,
        );
        this.previousInboundAudio = inboundResult.next;
        this.renderInboundAudio(summary.inboundAudio, inboundResult.bitrate);
        this.renderCandidateRoute(summary);
    }

    private renderOutboundAudio(
        outboundAudio: RtcStatsRecord | undefined,
        bitrate: number | undefined,
    ): void {
        this.logger.updateMetricValue("outboundAudioBitrate", formatBitrate(bitrate));
        this.logger.pushTrendPoint("trendOutboundAudioBitrate", bitrate);
        this.logger.updateMetricValue(
            "outboundPacketsSent",
            outboundAudio?.packetsSent === undefined ? "-" : `${outboundAudio.packetsSent}`,
        );
    }

    private renderInboundAudio(
        inboundAudio: RtcStatsRecord | undefined,
        bitrate: number | undefined,
    ): void {
        this.logger.updateMetricValue("inboundAudioBitrate", formatBitrate(bitrate));
        this.logger.pushTrendPoint("trendInboundAudioBitrate", bitrate);
        this.renderInboundPacketLoss(inboundAudio);

        if (inboundAudio?.jitter === undefined) {
            this.logger.updateMetricValue("inboundJitter", "-");
            return;
        }
        this.logger.updateMetricValue(
            "inboundJitter",
            `${(inboundAudio.jitter * 1000).toFixed(1)} ms`,
        );
    }

    private renderInboundPacketLoss(inboundAudio: RtcStatsRecord | undefined): void {
        const packetsLost = inboundAudio?.packetsLost;
        const packetsReceived = inboundAudio?.packetsReceived;
        this.logger.updateMetricValue(
            "inboundPacketsLost",
            packetsLost === undefined ? "-" : `${packetsLost}`,
        );
        if (
            packetsLost === undefined ||
            packetsReceived === undefined ||
            packetsLost + packetsReceived <= 0
        ) {
            this.logger.updateMetricValue("inboundPacketLossRate", "-");
            this.logger.pushTrendPoint("trendInboundPacketLossRate", undefined);
            return;
        }

        const lossRate = (packetsLost / (packetsLost + packetsReceived)) * 100;
        this.logger.updateMetricValue("inboundPacketLossRate", `${lossRate.toFixed(2)}%`);
        this.logger.pushTrendPoint("trendInboundPacketLossRate", lossRate);
    }

    private renderCandidateRoute(summary: RtcStatsSummary): void {
        this.renderRoundTripTime(summary.selectedPair);
        this.logger.updateMetricValue(
            "rtcAvailableOutgoingBitrate",
            formatBitrate(summary.selectedPair?.availableOutgoingBitrate),
        );

        const localCandidate = summary.selectedPair?.localCandidateId
            ? summary.localCandidates.get(summary.selectedPair.localCandidateId)
            : undefined;
        const remoteCandidate = summary.selectedPair?.remoteCandidateId
            ? summary.remoteCandidates.get(summary.selectedPair.remoteCandidateId)
            : undefined;
        if (!localCandidate || !remoteCandidate) {
            this.renderMissingCandidateRoute();
            return;
        }

        const localType = localCandidate.candidateType ?? "unknown";
        const remoteType = remoteCandidate.candidateType ?? "unknown";
        const localProtocol = localCandidate.protocol ?? "-";
        const relayProtocol = localCandidate.relayProtocol
            ? `/${localCandidate.relayProtocol}`
            : "";
        const localEndpoint = candidateEndpointLabel(localCandidate);
        const remoteEndpoint = candidateEndpointLabel(remoteCandidate);

        this.logger.updateMetricValue("rtcCandidatePair", `${localType} -> ${remoteType}`);
        this.logger.updateMetricValue("rtcTransportProtocol", `${localProtocol}${relayProtocol}`);
        this.logger.updateMetricValue("rtcLocalCandidate", localEndpoint);
        this.logger.updateMetricValue("rtcRemoteCandidate", remoteEndpoint);

        const routeSignature = `${localEndpoint}=>${remoteEndpoint}`;
        if (this.currentRouteSignature !== routeSignature) {
            this.currentRouteSignature = routeSignature;
            this.logger.addRtcEventLog(`selected route: ${localEndpoint} -> ${remoteEndpoint}`);
        }
    }

    private renderRoundTripTime(selectedPair: RtcStatsRecord | undefined): void {
        if (selectedPair?.currentRoundTripTime === undefined) {
            this.logger.updateMetricValue("rtcRoundTripTime", "-");
            this.logger.pushTrendPoint("trendRoundTripTime", undefined);
            return;
        }

        this.logger.updateMetricValue(
            "rtcRoundTripTime",
            `${(selectedPair.currentRoundTripTime * 1000).toFixed(1)} ms`,
        );
        this.logger.pushTrendPoint("trendRoundTripTime", selectedPair.currentRoundTripTime * 1000);
    }

    private renderMissingCandidateRoute(): void {
        this.logger.updateMetricValue("rtcCandidatePair", "-");
        this.logger.updateMetricValue("rtcTransportProtocol", "-");
        this.logger.updateMetricValue("rtcLocalCandidate", "-");
        this.logger.updateMetricValue("rtcRemoteCandidate", "-");
        this.currentRouteSignature = undefined;
    }
}

type RtcStatsSummary = {
    outboundAudio: RtcStatsRecord | undefined;
    inboundAudio: RtcStatsRecord | undefined;
    selectedPair: RtcStatsRecord | undefined;
    localCandidates: Map<string, RtcStatsRecord>;
    remoteCandidates: Map<string, RtcStatsRecord>;
};

function collectRtcStatsSummary(report: RTCStatsReport): RtcStatsSummary {
    const outboundAudioStats: RtcStatsRecord[] = [];
    const inboundAudioStats: RtcStatsRecord[] = [];
    const selectedPairs: RtcStatsRecord[] = [];
    const localCandidates = new Map<string, RtcStatsRecord>();
    const remoteCandidates = new Map<string, RtcStatsRecord>();

    report.forEach((stats) => {
        const statsRecord = normalizeRtcStatsRecord(stats);
        if (
            statsRecord.type === "outbound-rtp" &&
            statsRecord.kind === "audio" &&
            !statsRecord.isRemote
        ) {
            outboundAudioStats.push(statsRecord);
        }
        if (
            statsRecord.type === "inbound-rtp" &&
            statsRecord.kind === "audio" &&
            !statsRecord.isRemote
        ) {
            inboundAudioStats.push(statsRecord);
        }
        if (
            statsRecord.type === "candidate-pair" &&
            (statsRecord.selected || statsRecord.nominated)
        ) {
            selectedPairs.push(statsRecord);
        }
        if (statsRecord.type === "local-candidate") {
            localCandidates.set(statsRecord.id, statsRecord);
        }
        if (statsRecord.type === "remote-candidate") {
            remoteCandidates.set(statsRecord.id, statsRecord);
        }
    });

    return {
        outboundAudio: outboundAudioStats[0],
        inboundAudio: inboundAudioStats[0],
        selectedPair: selectedPairs[0],
        localCandidates,
        remoteCandidates,
    };
}

function formatBitrate(bitsPerSecond: number | undefined): string {
    if (bitsPerSecond === undefined || !Number.isFinite(bitsPerSecond) || bitsPerSecond < 0) {
        return "-";
    }
    if (bitsPerSecond >= 1_000_000) {
        return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`;
    }
    if (bitsPerSecond >= 1_000) {
        return `${(bitsPerSecond / 1_000).toFixed(1)} kbps`;
    }
    return `${bitsPerSecond.toFixed(0)} bps`;
}

function calcBitrate(
    currentBytes: number | undefined,
    currentTimestamp: number | undefined,
    prev: RtcByteCounter | undefined,
): RtcBitrateResult {
    if (currentBytes === undefined || currentTimestamp === undefined) {
        return { bitrate: undefined, next: prev };
    }
    if (prev === undefined) {
        return {
            bitrate: undefined,
            next: { bytes: currentBytes, timestamp: currentTimestamp },
        };
    }
    const durationSec = (currentTimestamp - prev.timestamp) / 1000;
    if (durationSec <= 0) {
        return { bitrate: undefined, next: prev };
    }
    const bitrate = ((currentBytes - prev.bytes) * 8) / durationSec;
    return {
        bitrate,
        next: { bytes: currentBytes, timestamp: currentTimestamp },
    };
}

function candidateEndpointLabel(candidate: RtcStatsRecord | undefined): string {
    if (!candidate) {
        return "-";
    }
    const address = candidate.address ?? candidate.ip ?? "-";
    const port = candidate.port === undefined ? "-" : `${candidate.port}`;
    const type = candidate.candidateType ?? "unknown";
    const protocol = candidate.protocol ?? "-";
    return `${address}:${port} (${type}/${protocol})`;
}
