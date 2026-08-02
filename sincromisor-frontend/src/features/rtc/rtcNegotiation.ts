import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";
import { type OfferResponse, parseOfferResponse } from "./rtcBoundarySchema";
import type { RtcOfferIdentity } from "./rtcNegotiationStateMachine";
import { postRtcSignalingJson } from "./rtcSignalingHttp";
import type { SincroRTCConfig } from "./sincroRtcConfigManager";

type RtcOfferPayload = {
    offer_request_id: string;
    offer_revision: number;
    previous_session_id?: string;
    sdp: string;
    session_id?: string;
    talk_mode: string;
    type: RTCSdpType;
};

type RtcNegotiationParams = {
    forceIceRestart: boolean;
    identity: RtcOfferIdentity;
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "answerSDP" | "offerSDP">;
    peerConnection: RTCPeerConnection;
    previousSessionId?: string;
    signal?: AbortSignal;
    sincroConfig: Pick<SincroRTCConfig, "offerURL">;
    talkMode: string;
};

/**
 * 1つのPeerConnection上でSDP生成、immutable payload送信、Answer適用を直列化する。
 *
 * identityは呼び出し元state machineが所有する。HTTP retryではserialized bodyを再利用し、
 * 新しいSDP/request IDを作らない。session/revision commitとcandidate flushはAnswer適用後の
 * 呼び出し元へ委ねるため、この関数はOfferResponseだけを返す。
 */
export async function negotiateRtcSession(params: RtcNegotiationParams): Promise<OfferResponse> {
    const offer = await createLocalOffer(params.peerConnection, params.forceIceRestart);
    params.logger.offerSDP(offer.sdp);

    const answer = parseOfferResponse(await postOffer(params, offer));
    params.logger.answerSDP(answer.sdp);
    await params.peerConnection.setRemoteDescription({
        sdp: answer.sdp,
        type: answer.type,
    });
    params.logger.addRtcEventLog(
        `negotiate answer applied: sessionId=${answer.session_id}, revision=${answer.offer_revision ?? "legacy"}`,
    );
    return answer;
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
        offer_request_id: params.identity.requestId,
        offer_revision: params.identity.revision,
        sdp: offer.sdp,
        talk_mode: params.talkMode,
        type: offer.type,
    };
    if (params.identity.sessionId !== undefined) {
        offerPayload.session_id = params.identity.sessionId;
    } else if (params.previousSessionId !== undefined) {
        offerPayload.previous_session_id = params.previousSessionId;
    }
    params.logger.addRtcEventLog(
        `send offer: operation=${params.identity.sessionId ? "update" : "initial"}, revision=${params.identity.revision}`,
    );

    // JSON serializationはretry loopの外で1回だけ行い、request identityとSDP bytesを固定する。
    return postRtcSignalingJson({
        body: JSON.stringify(offerPayload),
        operation: params.identity.sessionId ? "update-offer" : "initial-offer",
        signal: params.signal,
        url: params.sincroConfig.offerURL,
    });
}
