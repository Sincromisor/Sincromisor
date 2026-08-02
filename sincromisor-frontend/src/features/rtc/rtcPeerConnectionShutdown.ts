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

/**
 * DataChannel/transceiverを停止し、1秒後にPeerConnectionをcloseする。
 *
 * `stopSenderTracks`の既定値はtrueであり、resource ownerが明示したreplacement時だけtrackを保持する。
 */
export function closeRtcPeerConnection(params: RtcPeerConnectionShutdownParams): void {
    params.textChannel.close();
    params.telopChannel.close();

    if (params.peerConnection.getTransceivers) {
        params.peerConnection.getTransceivers().forEach((transceiver) => {
            if (transceiver.stop) {
                transceiver.stop();
            }
        });
    }

    if (params.stopSenderTracks ?? true) {
        params.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
            sender.track?.stop();
        });
    }

    setTimeout(() => {
        params.peerConnection.close();
    }, 1000);
}
