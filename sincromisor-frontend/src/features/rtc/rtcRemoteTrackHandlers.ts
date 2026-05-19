import { frontendLogger } from "../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";

type RtcRemoteTrackParams = {
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "setRemoteAudioTrack">;
    peerConnection: RTCPeerConnection;
};

export function setupRtcRemoteTrackHandlers(params: RtcRemoteTrackParams): void {
    params.peerConnection.addEventListener("track", (evt: RTCTrackEvent) => {
        if (evt.track.kind === "video") {
            frontendLogger.warn("Unexpected remote video track received.");
            attachRemoteVideoTrack(evt);
            return;
        }
        attachRemoteAudioTrack(evt, params.logger);
    });
}

function attachRemoteVideoTrack(evt: RTCTrackEvent): void {
    const rtcVideo = document.querySelector<HTMLVideoElement>("video#rtcVideo") ?? undefined;
    if (rtcVideo === undefined) {
        throw new Error("video#rtcVideo is not found.");
    }
    rtcVideo.srcObject = evt.streams[0];
}

function attachRemoteAudioTrack(
    evt: RTCTrackEvent,
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "setRemoteAudioTrack">,
): void {
    const rtcAudio = document.querySelector<HTMLAudioElement>("audio#rtcAudio") ?? undefined;
    if (rtcAudio === undefined) {
        throw new Error("audio#rtcAudio is not found.");
    }
    rtcAudio.srcObject = evt.streams[0];
    logger.setRemoteAudioTrack(evt.track);
    logger.addRtcEventLog(`remote track received: ${evt.track.kind}`);
}
