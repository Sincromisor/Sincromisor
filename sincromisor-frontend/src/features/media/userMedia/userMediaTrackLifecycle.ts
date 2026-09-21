import { frontendLogger } from "../../../shared/logging/appLogger";
import { diagnosticReason } from "../../../shared/logging/browserDiagnostics";
import { createAudioOnlyConstraints } from "./userMediaConstraints";

export async function installMediaStreamTracks(options: {
    mediaStream: MediaStream;
    processAudioTrack: (track: MediaStreamTrack) => Promise<MediaStreamTrack>;
    onRawAudioTrack: (track: MediaStreamTrack) => void;
    onProcessedAudioTrack: (track: MediaStreamTrack) => void;
    onVideoTrack: (track: MediaStreamTrack) => void;
}): Promise<void> {
    for (const track of options.mediaStream.getTracks()) {
        observeTrack(track);
        if (track.kind === "audio") {
            frontendLogger.info("Audio track acquired.");
            options.onRawAudioTrack(track);
            options.onProcessedAudioTrack(await options.processAudioTrack(track));
        } else if (track.kind === "video") {
            frontendLogger.info("Video track acquired.");
            options.onVideoTrack(track);
        } else {
            frontendLogger.warn("Unknown media track acquired.", { kind: track.kind });
        }
    }
}

export async function acquireRawAudioTrack(
    config: MediaStreamConstraints,
): Promise<MediaStreamTrack> {
    const nextStream = await navigator.mediaDevices
        .getUserMedia(createAudioOnlyConstraints(config))
        .catch((error: unknown) => {
            frontendLogger.diagnostic("microphone", diagnosticReason(error));
            throw error;
        });
    const nextRawTrack = nextStream.getAudioTracks()[0];
    if (!nextRawTrack) {
        throw new Error("選択されたマイク入力デバイスから音声トラックを取得できませんでした。");
    }
    observeTrack(nextRawTrack);
    return nextRawTrack;
}

export function stopPreviousAudioTracks(
    previousRawTrack: MediaStreamTrack | undefined,
    previousProcessedTrack: MediaStreamTrack | undefined,
): void {
    previousProcessedTrack?.stop();
    if (previousRawTrack && previousRawTrack !== previousProcessedTrack) {
        previousRawTrack.stop();
    }
}

export function stopTrack(track: MediaStreamTrack | undefined): void {
    track?.stop();
}

/** 自然終了と再取得を記録する。明示的なstopはendedを発火せず障害に数えない。 */
function observeTrack(track: MediaStreamTrack): void {
    const event =
        track.kind === "audio" ? "microphone" : track.kind === "video" ? "camera" : undefined;
    if (!event) return;
    frontendLogger.diagnostic(event, "ready");
    track.addEventListener("ended", () => frontendLogger.diagnostic(event, "ended"), {
        once: true,
    });
}
