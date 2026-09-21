import { frontendLogger } from "../../shared/logging/appLogger";
import type { DebugConsoleManager } from "../debug/model/debugConsoleManager";

type RtcRemoteTrackParams = {
    logger: Pick<DebugConsoleManager, "addRtcEventLog" | "setRemoteAudioTrack">;
    peerConnection: RTCPeerConnection;
    signal: AbortSignal;
};

/** 現接続の受信トラックを再生要素へ接続し、世代終了時は購読を解除する。 */
export function setupRtcRemoteTrackHandlers(params: RtcRemoteTrackParams): void {
    params.peerConnection.addEventListener(
        "track",
        (evt: RTCTrackEvent) => {
            // 受信内容や機器名を送らず、世代に属するトラックの生存だけを記録する。
            frontendLogger.diagnostic("rtc_track", "ready");
            evt.track.addEventListener(
                "ended",
                () => frontendLogger.diagnostic("rtc_track", "ended"),
                { signal: params.signal },
            );
            if (evt.track.kind === "video") {
                frontendLogger.warn("Unexpected remote video track received.");
                attachRemoteVideoTrack(evt);
                return;
            }
            attachRemoteAudioTrack(evt, params.logger);
        },
        { signal: params.signal },
    );
}

/** 想定外の映像も既存の専用要素へ接続する。表示先がなければ呼出元へ失敗を伝える。 */
function attachRemoteVideoTrack(evt: RTCTrackEvent): void {
    const rtcVideo = document.querySelector<HTMLVideoElement>("video#rtcVideo") ?? undefined;
    if (rtcVideo === undefined) {
        throw new Error("video#rtcVideo is not found.");
    }
    rtcVideo.srcObject = evt.streams[0];
}

/** 受信音声を再生要素と既存の診断表示へ接続する。音声内容は診断送信しない。 */
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
