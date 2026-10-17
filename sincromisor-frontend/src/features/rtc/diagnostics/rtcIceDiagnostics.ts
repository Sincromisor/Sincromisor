import { frontendLogger } from "../../../shared/logging/appLogger";
import { iceDiagnosticSummarySchema } from "../../../shared/logging/iceDiagnosticSummary";
import type { DebugConsoleManager } from "../../debug/model/debugConsoleManager";
import { normalizeRtcStatsRecord, type RtcStatsRecord } from "./rtcStatsRecords";

type RtcIceDiagnosticsParams = {
    logger: Pick<DebugConsoleManager, "addRtcEventLog">;
    peerConnection: Pick<RTCPeerConnection, "getStats" | "signalingState" | "iceGatheringState">;
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

/** 既存の失敗時統計を一度取り、中央へは選別した要約と開始時の会話だけを渡す。 */
export async function captureIceFailureDiagnostics(params: RtcIceDiagnosticsParams): Promise<void> {
    const sessionId = params.sessionId;
    const signalingState = params.peerConnection.signalingState;
    const gatheringState = params.peerConnection.iceGatheringState;
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
        // 端末表示用statsをそのまま渡さず、項目ごとに未知値・非有限値を省く。
        const fields = iceDiagnosticSummarySchema.shape;
        frontendLogger.diagnostics.record("rtc", "failed", {
            session_id: sessionId,
            ice_summary: {
                signaling_state: fields.signaling_state.safeParse(signalingState).data,
                gathering_state: fields.gathering_state.safeParse(gatheringState).data,
                pair_state: fields.pair_state.safeParse(selectedPair?.state).data,
                local_type: fields.local_type.safeParse(local?.candidateType).data,
                remote_type: fields.remote_type.safeParse(remote?.candidateType).data,
                pair_count: fields.pair_count.safeParse(diagnostics.pairTotal).data,
                succeeded_pair_count: fields.succeeded_pair_count.safeParse(
                    diagnostics.pairSucceeded,
                ).data,
                rtt_ms: fields.rtt_ms.safeParse(
                    selectedPair?.currentRoundTripTime === undefined
                        ? undefined
                        : selectedPair.currentRoundTripTime * 1000,
                ).data,
            },
        });
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

/** 統計をペア数・選択候補・候補種別へ集約する。 */
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

/** selectedまたはnominatedのペアを統計順に保持し、要約には先頭を使う。 */
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

/** ローカルとリモートを分け、ペア参照用の候補と端末表示用の種別数を保持する。 */
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
