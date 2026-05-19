import { frontendLogger } from "../logging/appLogger";
import type { DebugConsoleManager } from "../ui/debugConsoleManager";
import { parseOfferResponse } from "./rtcBoundarySchema";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

type RtcOfferPayload = {
    sdp: string;
    type: RTCSdpType;
    talk_mode: string;
    session_id?: string;
};

type RtcNegotiationParams = {
    flushPendingIceCandidates: () => Promise<void>;
    forceIceRestart: boolean;
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "answerSDP" | "offerSDP">;
    onSessionAssigned: (sessionId: string) => void;
    peerConnection: RTCPeerConnection;
    preferredSessionId?: string;
    sincroConfig: Pick<SincroRTCConfig, "offerURL">;
    talkMode: string;
};

export async function negotiateRtcSession(params: RtcNegotiationParams): Promise<void> {
    const offer = await createLocalOffer(params.peerConnection, params.forceIceRestart);
    params.logger.offerSDP(offer.sdp);

    const answer = parseOfferResponse(await postOffer(params, offer));
    params.logger.answerSDP(answer.sdp);
    params.onSessionAssigned(answer.session_id);
    logAssignedSession(params, answer.session_id);

    // Offer 応答前に貯まった candidate は、session_id 確定後に送信する。
    await params.flushPendingIceCandidates();
    await params.peerConnection.setRemoteDescription({
        sdp: answer.sdp,
        type: answer.type,
    });
    params.logger.addRtcEventLog("negotiate succeeded: reconnect attempt reset");
}

async function createLocalOffer(
    peerConnection: RTCPeerConnection,
    forceIceRestart: boolean,
): Promise<RTCSessionDescription> {
    await peerConnection.setLocalDescription(
        await peerConnection.createOffer({ iceRestart: forceIceRestart }),
    );
    const offer = peerConnection.localDescription ?? undefined;
    if (offer === undefined) {
        throw new Error("Offer is undefined.");
    }
    return offer;
}

async function postOffer(
    params: RtcNegotiationParams,
    offer: RTCSessionDescription,
): Promise<unknown> {
    const offerPayload: RtcOfferPayload = {
        sdp: offer.sdp,
        type: offer.type,
        talk_mode: params.talkMode,
    };
    if (params.preferredSessionId) {
        offerPayload.session_id = params.preferredSessionId;
    }
    params.logger.addRtcEventLog(
        `send offer: mode=${params.preferredSessionId ? "session-update" : "new-session"}, targetSessionId=${params.preferredSessionId ?? "-"}`,
    );

    const response = await fetch(params.sincroConfig.offerURL, {
        body: JSON.stringify(offerPayload),
        headers: {
            "Content-Type": "application/json",
        },
        method: "POST",
    });
    switch (response.status) {
        case 200:
            return response.json();
        case 429:
            frontendLogger.warn("RTC offer rejected by rate limit.", {
                status: response.status,
                statusText: response.statusText,
            });
            throw new Error(`Too many requests - ${response.status} ${response.statusText}`);
        default:
            frontendLogger.error("RTC offer failed with invalid response.", {
                status: response.status,
                statusText: response.statusText,
            });
            throw new Error(`Invalid response - ${response.status} ${response.statusText}`);
    }
}

function logAssignedSession(params: RtcNegotiationParams, sessionId: string): void {
    if (params.preferredSessionId && params.preferredSessionId !== sessionId) {
        // サーバー側で既存更新に失敗した場合は、新規セッションへのフォールバックが返る。
        params.logger.addRtcEventLog(
            `offer fallback detected: preferredSessionId=${params.preferredSessionId}, assignedSessionId=${sessionId}`,
        );
        return;
    }
    if (params.preferredSessionId) {
        params.logger.addRtcEventLog(`offer update succeeded: sessionId=${sessionId}`);
        return;
    }
    params.logger.addRtcEventLog(`offer created new session: sessionId=${sessionId}`);
}
