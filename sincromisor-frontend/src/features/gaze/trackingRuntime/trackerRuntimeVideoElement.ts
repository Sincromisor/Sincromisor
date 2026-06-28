/**
 * MediaStreamTrack を hidden video element へ接続し、推論可能な ready state を確認する DOM 境界。
 * track の停止責務は TrackerRuntime 側に残し、この helper は element の srcObject と readiness だけを扱う。
 */
const MIN_DETECTABLE_VIDEO_DIMENSION_PX = 2;

export function attachTrackerVideoTrack(
    videoElement: HTMLVideoElement,
    videoTrack: MediaStreamTrack,
): void {
    const videoStream = new MediaStream();
    videoStream.addTrack(videoTrack);
    videoElement.setAttribute("autoplay", "true");
    videoElement.setAttribute("playsinline", "true");
    videoElement.setAttribute("muted", "true");
    videoElement.srcObject = videoStream;
}

export function trackerVideoFrameIsReady(videoElement: HTMLVideoElement): boolean {
    return (
        videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoElement.videoWidth >= MIN_DETECTABLE_VIDEO_DIMENSION_PX &&
        videoElement.videoHeight >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
    );
}
