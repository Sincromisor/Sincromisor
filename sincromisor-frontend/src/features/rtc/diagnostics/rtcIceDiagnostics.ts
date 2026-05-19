import { frontendLogger } from "../../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../../debug/model/debugConsoleManager";
import { normalizeRtcStatsRecord, type RtcStatsRecord } from "./rtcStatsRecords";

type RtcIceDiagnosticsParams = {
    logger: Pick<DebugConsoleManager, "addRtcEventLog">;
    peerConnection: RTCPeerConnection;
    reason: string;
    sessionId?: string;
};

type IceDiagnostics = {
    selectedPairs: RtcStatsRecord[];
    pairTotal: number;
    pairSucceeded: number;
    localCandidates: Map<string, RtcStatsRecord>;
    remoteCandidates: Map<string, RtcStatsRecord>;
    localTypeCount: Record<string, number>;
    remoteTypeCount: Record<string, number>;
};

export async function captureIceFailureDiagnostics(params: RtcIceDiagnosticsParams): Promise<void> {
    try {
        const report = await params.peerConnection.getStats();
        const diagnostics = collectIceDiagnostics(report);
        const selectedPair = diagnostics.selectedPairs[0];
        const local = selectedPair?.localCandidateId
            ? diagnostics.localCandidates.get(selectedPair.localCandidateId)
            : undefined;
        const remote = selectedPair?.remoteCandidateId
            ? diagnostics.remoteCandidates.get(selectedPair.remoteCandidateId)
            : undefined;
        const localType = local?.candidateType ?? "-";
        const remoteType = remote?.candidateType ?? "-";
        const pairState = selectedPair?.state ?? "-";
        const rttMs =
            selectedPair?.currentRoundTripTime !== undefined
                ? `${(selectedPair.currentRoundTripTime * 1000).toFixed(1)}ms`
                : "-";

        params.logger.addRtcEventLog(
            `ICE failure diagnostics: reason=${params.reason}, pair=${pairState} ${localType}->${remoteType}, rtt=${rttMs}, pairs=${diagnostics.pairSucceeded}/${diagnostics.pairTotal}(succeeded/total)`,
        );
        params.logger.addRtcEventLog(
            `ICE failure diagnostics: localCandidates=${JSON.stringify(diagnostics.localTypeCount)}, remoteCandidates=${JSON.stringify(diagnostics.remoteTypeCount)}, ua=${navigator.userAgent}`,
        );
        params.logger.addRtcEventLog(
            `ICE failure diagnostics: signaling=${params.peerConnection.signalingState}, gathering=${params.peerConnection.iceGatheringState}, session_id=${params.sessionId ?? "-"}`,
        );
    } catch (error) {
        params.logger.addRtcEventLog(`ICE failure diagnostics collection failed: ${error}`);
        frontendLogger.error("ICE failure diagnostics collection failed.", { error });
    }
}

function collectIceDiagnostics(report: RTCStatsReport): IceDiagnostics {
    const diagnostics: IceDiagnostics = {
        selectedPairs: [],
        pairTotal: 0,
        pairSucceeded: 0,
        localCandidates: new Map<string, RtcStatsRecord>(),
        remoteCandidates: new Map<string, RtcStatsRecord>(),
        localTypeCount: {},
        remoteTypeCount: {},
    };
    report.forEach((stats) => {
        addIceDiagnosticStats(diagnostics, stats);
    });
    return diagnostics;
}

function addIceDiagnosticStats(
    diagnostics: ReturnType<typeof collectIceDiagnostics>,
    stats: RTCStats,
): void {
    if (stats.type === "candidate-pair") {
        const pairStats = normalizeRtcStatsRecord(stats);
        diagnostics.pairTotal += 1;
        if (pairStats.state === "succeeded") {
            diagnostics.pairSucceeded += 1;
        }
        if (pairStats.selected || pairStats.nominated) {
            diagnostics.selectedPairs.push(pairStats);
        }
    }
    if (stats.type === "local-candidate" || stats.type === "remote-candidate") {
        addIceCandidateStats(diagnostics, stats);
    }
}

function addIceCandidateStats(
    diagnostics: ReturnType<typeof collectIceDiagnostics>,
    stats: RTCStats,
): void {
    const candidateStats = normalizeRtcStatsRecord(stats);
    const typeCount =
        stats.type === "local-candidate" ? diagnostics.localTypeCount : diagnostics.remoteTypeCount;
    const candidates =
        stats.type === "local-candidate"
            ? diagnostics.localCandidates
            : diagnostics.remoteCandidates;
    candidates.set(candidateStats.id, candidateStats);
    const candidateType = candidateStats.candidateType ?? "unknown";
    typeCount[candidateType] = (typeCount[candidateType] ?? 0) + 1;
}
