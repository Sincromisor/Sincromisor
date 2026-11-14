import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";

type RtcPeerConnectionEventParams = {
    logger: Pick<
        DebugConsoleManager,
        | "addRtcEventLog"
        | "updateConnectionState"
        | "newIceConnectionState"
        | "newIceGatheringState"
        | "newSignalingState"
        | "updateIceConnectionState"
        | "updateIceGatheringState"
        | "updateSignalingState"
    >;
    onConnectionStateChange: (state: RTCPeerConnectionState) => void;
    onIceConnectionStateChange: (state: RTCIceConnectionState) => void;
    peerConnection: RTCPeerConnection;
    signal: AbortSignal;
    sendIceCandidate: (candidate: RTCIceCandidateInit | null) => void;
};

/**
 * 接続全体・ICE・シグナリング通知を接続管理と診断へ渡す。
 * 接続世代の中断時に全購読を解除し、旧接続から診断状態を書き戻さない。
 */
export function setupRtcPeerConnectionEvents(params: RtcPeerConnectionEventParams): void {
    params.peerConnection.addEventListener(
        "icecandidate",
        (event) => {
            // event.candidate === null は end-of-candidates。サーバー側にも明示する。
            const candidate = event.candidate ? event.candidate.toJSON() : null;
            params.sendIceCandidate(candidate);
            if (candidate) {
                params.logger.addRtcEventLog(`new ICE candidate: ${candidate.sdpMid ?? "audio"}`);
                return;
            }
            params.logger.addRtcEventLog("ICE candidate gathering completed");
        },
        { signal: params.signal },
    );
    params.peerConnection.addEventListener(
        "icecandidateerror",
        (event) => {
            // STUN/TURN への疎通失敗をブラウザが検知した場合の詳細ログ。
            params.logger.addRtcEventLog(formatIceCandidateError(event));
        },
        { signal: params.signal },
    );

    // 新世代の初期状態を先に表示へ渡し、旧接続の成功表示を引き継がない。
    params.logger.updateConnectionState(params.peerConnection.connectionState);
    params.peerConnection.addEventListener(
        "connectionstatechange",
        () => {
            const state = params.peerConnection.connectionState;
            params.logger.updateConnectionState(state);
            params.onConnectionStateChange(state);
        },
        { signal: params.signal },
    );
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
        { signal: params.signal },
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
        { signal: params.signal },
    );
    params.logger.newIceConnectionState(params.peerConnection.iceConnectionState);
}

function setupSignalingStateLog(params: RtcPeerConnectionEventParams): void {
    params.peerConnection.addEventListener(
        "signalingstatechange",
        () => {
            params.logger.updateSignalingState(params.peerConnection.signalingState);
        },
        { signal: params.signal },
    );
    params.logger.newSignalingState(params.peerConnection.signalingState);
}
