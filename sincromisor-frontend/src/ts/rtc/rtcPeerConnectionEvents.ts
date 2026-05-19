import type { DebugConsoleManager } from "../ui/debugConsoleManager";

type RtcPeerConnectionEventParams = {
    logger: Pick<
        DebugConsoleManager,
        | "addRtcEventLog"
        | "newIceConnectionState"
        | "newIceGatheringState"
        | "newSignalingState"
        | "updateIceConnectionState"
        | "updateIceGatheringState"
        | "updateSignalingState"
    >;
    onIceConnectionStateChange: (state: RTCIceConnectionState) => void;
    peerConnection: RTCPeerConnection;
    sendIceCandidate: (candidate: RTCIceCandidateInit | null) => void;
};

export function setupRtcPeerConnectionEvents(params: RtcPeerConnectionEventParams): void {
    params.peerConnection.addEventListener("icecandidate", (event) => {
        // event.candidate === null は end-of-candidates。サーバー側にも明示する。
        const candidate = event.candidate ? event.candidate.toJSON() : null;
        params.sendIceCandidate(candidate);
        if (candidate) {
            params.logger.addRtcEventLog(`new ICE candidate: ${candidate.sdpMid ?? "audio"}`);
            return;
        }
        params.logger.addRtcEventLog("ICE candidate gathering completed");
    });
    params.peerConnection.addEventListener("icecandidateerror", (event) => {
        // STUN/TURN への疎通失敗をブラウザが検知した場合の詳細ログ。
        params.logger.addRtcEventLog(formatIceCandidateError(event));
    });

    setupIceGatheringStateLog(params);
    setupIceConnectionStateLog(params);
    setupSignalingStateLog(params);
}

function formatIceCandidateError(event: Event): string {
    const url = "url" in event && typeof event.url === "string" ? event.url : "-";
    const errorCode =
        "errorCode" in event && typeof event.errorCode === "number" ? event.errorCode : "-";
    const errorText =
        "errorText" in event && typeof event.errorText === "string" ? event.errorText : "-";
    return `ICE candidate error: url=${url}, code=${errorCode}, text=${errorText}`;
}

function setupIceGatheringStateLog(params: RtcPeerConnectionEventParams): void {
    params.peerConnection.addEventListener(
        "icegatheringstatechange",
        () => {
            params.logger.updateIceGatheringState(params.peerConnection.iceGatheringState);
        },
        false,
    );
    params.logger.newIceGatheringState(params.peerConnection.iceGatheringState);
}

function setupIceConnectionStateLog(params: RtcPeerConnectionEventParams): void {
    params.peerConnection.addEventListener(
        "iceconnectionstatechange",
        () => {
            const state = params.peerConnection.iceConnectionState;
            params.logger.updateIceConnectionState(state);
            params.onIceConnectionStateChange(state);
        },
        false,
    );
    params.logger.newIceConnectionState(params.peerConnection.iceConnectionState);
}

function setupSignalingStateLog(params: RtcPeerConnectionEventParams): void {
    params.peerConnection.addEventListener(
        "signalingstatechange",
        () => {
            params.logger.updateSignalingState(params.peerConnection.signalingState);
        },
        false,
    );
    params.logger.newSignalingState(params.peerConnection.signalingState);
}
