/**
 * PeerConnection bundleを閉じる際のmedia track ownershipを指定する。
 *
 * logical client自体をstopする場合はsender trackも停止する。session-loss/legacy replacementでは
 * 同じlive trackを次bundleへ渡すため、`stopSenderTracks`をfalseにして旧PC/DataChannelだけを閉じる。
 */
export type RtcPeerConnectionShutdownParams = {
    peerConnection: RTCPeerConnection;
    stopSenderTracks?: boolean;
    telopChannel: RTCDataChannel;
    textChannel: RTCDataChannel;
};

// 接続失敗と利用者の停止が重なっても、同じ接続を再度停止・closeしない。
const closingPeerConnections = new WeakSet<RTCPeerConnection>();

/**
 * DataChannel/transceiverを停止し、1秒後にPeerConnectionをcloseする。
 *
 * `stopSenderTracks`の既定値はtrueであり、resource ownerが明示したreplacement時だけtrackを保持する。
 */
export function closeRtcPeerConnection(params: RtcPeerConnectionShutdownParams): void {
    // 置き換え時は保持した送信トラックも、後の明示停止では解放する。
    if (params.stopSenderTracks ?? true) {
        params.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
            sender.track?.stop();
        });
    }
    if (closingPeerConnections.has(params.peerConnection)) return;
    closingPeerConnections.add(params.peerConnection);
    params.textChannel.close();
    params.telopChannel.close();

    if (
        params.peerConnection.signalingState !== "closed" &&
        params.peerConnection.getTransceivers
    ) {
        params.peerConnection.getTransceivers().forEach((transceiver) => {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    setTimeout(() => {
        params.peerConnection.close();
    }, 1000);
}
