import { frontendLogger } from "../logging/appLogger";
import type { DebugConsoleManager } from "../UI/DebugConsoleManager";
import { normalizeRtcStatsRecord, type RtcStatsRecord } from "./rtcStatsRecords";

type RtcIceDiagnosticsParams = {
    logger: Pick<DebugConsoleManager, "addRtcEventLog">;
    peerConnection: RTCPeerConnection;
    reason: string;
    sessionId?: string;
};

export async function captureIceFailureDiagnostics(params: RtcIceDiagnosticsParams): Promise<void> {
    try {
        const report = await params.peerConnection.getStats();
        const selectedPairs: RtcStatsRecord[] = [];
        let pairTotal = 0;
        let pairSucceeded = 0;
        const localCandidates = new Map<string, RtcStatsRecord>();
        const remoteCandidates = new Map<string, RtcStatsRecord>();
        const localTypeCount: Record<string, number> = {};
        const remoteTypeCount: Record<string, number> = {};

        report.forEach((stats) => {
            if (stats.type === "candidate-pair") {
                const pairStats = normalizeRtcStatsRecord(stats);
                pairTotal += 1;
                if (pairStats.state === "succeeded") {
                    pairSucceeded += 1;
                }
                if (pairStats.selected || pairStats.nominated) {
                    selectedPairs.push(pairStats);
                }
            }
            if (stats.type === "local-candidate") {
                const candidateStats = normalizeRtcStatsRecord(stats);
                localCandidates.set(candidateStats.id, candidateStats);
                const candidateType = candidateStats.candidateType ?? "unknown";
                localTypeCount[candidateType] = (localTypeCount[candidateType] ?? 0) + 1;
            }
            if (stats.type === "remote-candidate") {
                const candidateStats = normalizeRtcStatsRecord(stats);
                remoteCandidates.set(candidateStats.id, candidateStats);
                const candidateType = candidateStats.candidateType ?? "unknown";
                remoteTypeCount[candidateType] = (remoteTypeCount[candidateType] ?? 0) + 1;
            }
        });

        const selectedPair = selectedPairs[0];
        const local = selectedPair?.localCandidateId
            ? localCandidates.get(selectedPair.localCandidateId)
            : undefined;
        const remote = selectedPair?.remoteCandidateId
            ? remoteCandidates.get(selectedPair.remoteCandidateId)
            : undefined;
        const localType = local?.candidateType ?? "-";
        const remoteType = remote?.candidateType ?? "-";
        const pairState = selectedPair?.state ?? "-";
        const rttMs =
            selectedPair?.currentRoundTripTime !== undefined
                ? `${(selectedPair.currentRoundTripTime * 1000).toFixed(1)}ms`
                : "-";

        params.logger.addRtcEventLog(
            `ICE failure diagnostics: reason=${params.reason}, pair=${pairState} ${localType}->${remoteType}, rtt=${rttMs}, pairs=${pairSucceeded}/${pairTotal}(succeeded/total)`,
        );
        params.logger.addRtcEventLog(
            `ICE failure diagnostics: localCandidates=${JSON.stringify(localTypeCount)}, remoteCandidates=${JSON.stringify(remoteTypeCount)}, ua=${navigator.userAgent}`,
        );
        params.logger.addRtcEventLog(
            `ICE failure diagnostics: signaling=${params.peerConnection.signalingState}, gathering=${params.peerConnection.iceGatheringState}, session_id=${params.sessionId ?? "-"}`,
        );
    } catch (error) {
        params.logger.addRtcEventLog(`ICE failure diagnostics collection failed: ${error}`);
        frontendLogger.error("ICE failure diagnostics collection failed.", { error });
    }
}
