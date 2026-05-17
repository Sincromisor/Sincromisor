export type RtcPeerConnectionShutdownParams = {
    peerConnection: RTCPeerConnection;
    telopChannel: RTCDataChannel;
    textChannel: RTCDataChannel;
};

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

    params.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
        sender.track?.stop();
    });

    window.setTimeout(() => {
        params.peerConnection.close();
    }, 1000);
}
