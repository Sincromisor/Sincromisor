import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";
import { parseIceCandidateResponse } from "./rtcBoundarySchema";
import { postRtcSignalingJson } from "./rtcSignalingHttp";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

type RtcIceCandidateSenderParams = {
    candidate: RTCIceCandidateInit | null;
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "addTextChannelLog">;
    offerRevision: number;
    sessionId: string;
    signal?: AbortSignal;
    sincroConfig: Pick<SincroRTCConfig, "candidateURL">;
};

/**
 * revisionに帰属するcandidateをretry付きで送る。
 *
 * failureはgeneration ownerへ必ず伝播し、単体dropにしない。これにより404/410は
 * bundle replacementへ、その他のstatus/parse/retry exhaustionはterminal closeへ遷移できる。
 */
export async function sendRtcIceCandidate(params: RtcIceCandidateSenderParams): Promise<void> {
    const result = parseIceCandidateResponse(
        await postRtcSignalingJson({
            body: JSON.stringify({
                session_id: params.sessionId,
                offer_revision: params.offerRevision,
                candidate: params.candidate,
            }),
            operation: "candidate",
            signal: params.signal,
            url: params.sincroConfig.candidateURL,
        }),
    );
    if (result.status === false) {
        params.logger.addRtcEventLog(
            `ICE candidate ignored by server: ${result.reason ?? "unknown_reason"}`,
        );
    }
}
