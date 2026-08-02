import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";

type RtcAudioTrackSenderParams = {
    isMuted: boolean;
    logger: Pick<DebugConsoleManager, "addRtcEventLog">;
    peerConnection: RTCPeerConnection;
};

/**
 * 現PeerConnectionのsender trackを一括mute/unmuteする。
 * track ownershipやstop状態は変更せず、enabledだけを更新する。
 */
export function setRtcAudioMute(params: RtcAudioTrackSenderParams): void {
    params.peerConnection.getSenders().forEach((sender: RTCRtpSender) => {
        if (sender.track) {
            sender.track.enabled = !params.isMuted;
        }
    });
}

/**
 * logical clientが保持するlive audio trackを現bundleのaudio senderへ移す。
 *
 * sender欠落時はaddTrackへfallbackする。旧trackのstopはmedia device ownerへ委ね、
 * bundle replacement用trackのlivenessをこのhelperでは変更しない。
 */
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
