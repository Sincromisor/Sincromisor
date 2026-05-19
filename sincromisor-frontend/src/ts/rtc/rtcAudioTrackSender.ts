import type { DebugConsoleManager } from "../ui/debugConsoleManager";

type RtcAudioTrackSenderParams = {
    isMuted: boolean;
    logger: Pick<DebugConsoleManager, "addRtcEventLog">;
    peerConnection: RTCPeerConnection;
};

export function setRtcAudioMute(params: RtcAudioTrackSenderParams): void {
    params.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
        if (sender.track) {
            sender.track.enabled = !params.isMuted;
        }
    });
}

export async function replaceRtcAudioTrack(
    params: RtcAudioTrackSenderParams & { audioTrack: MediaStreamTrack },
): Promise<void> {
    params.audioTrack.enabled = !params.isMuted;
    const audioSender = params.peerConnection
        .getSenders()
        .find((sender) => sender.track?.kind === "audio");
    if (!audioSender) {
        params.peerConnection.addTrack(params.audioTrack);
        params.logger.addRtcEventLog("replace audio track: sender missing, added new track");
        return;
    }
    await audioSender.replaceTrack(params.audioTrack);
    const audioTrackLabel = params.audioTrack.label === "" ? "-" : params.audioTrack.label;
    params.logger.addRtcEventLog(`replace audio track: label=${audioTrackLabel}`);
}
