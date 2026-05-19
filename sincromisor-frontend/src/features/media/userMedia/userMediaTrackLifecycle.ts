import { frontendLogger } from "../../../shared/logging/appLogger";
import { createAudioOnlyConstraints } from "./userMediaConstraints";

export async function installMediaStreamTracks(options: {
    mediaStream: MediaStream;
    processAudioTrack: (track: MediaStreamTrack) => Promise<MediaStreamTrack>;
    onRawAudioTrack: (track: MediaStreamTrack) => void;
    onProcessedAudioTrack: (track: MediaStreamTrack) => void;
    onVideoTrack: (track: MediaStreamTrack) => void;
}): Promise<void> {
    for (const track of options.mediaStream.getTracks()) {
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
    const nextStream = await navigator.mediaDevices.getUserMedia(
        createAudioOnlyConstraints(config),
    );
    const nextRawTrack = nextStream.getAudioTracks()[0];
    if (!nextRawTrack) {
        throw new Error("選択されたマイク入力デバイスから音声トラックを取得できませんでした。");
    }
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
