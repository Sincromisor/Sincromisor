import type { DebugConsoleManager } from "../UI/DebugConsoleManager";

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
        const err = event as RTCPeerConnectionIceErrorEvent;
        params.logger.addRtcEventLog(
            `ICE candidate error: url=${err.url ?? "-"}, code=${err.errorCode}, text=${err.errorText ?? "-"}`,
        );
    });

    setupIceGatheringStateLog(params);
    setupIceConnectionStateLog(params);
    setupSignalingStateLog(params);
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
