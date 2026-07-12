/**
 * TrackerRuntime の hidden video element に MediaStreamTrack を接続する DOM 境界。
 *
 * track 停止、permission retry、camera source の所有は TrackerRuntime 側に残し、この module は
 * `srcObject` と video readiness の判定だけを扱う。
 */
const MIN_DETECTABLE_VIDEO_DIMENSION_PX = 2;

/**
 * 既存 video element に単一 camera track を接続し、autoplay / playsinline / muted を推論用に固定する。
 *
 * 新しい `MediaStream` は element 接続のためだけに作る。`videoTrack.stop()` は呼ばず、source 差し替え時の
 * track 解放順序は caller が管理する。
 */
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

/**
 * MediaPipe 推論に渡せる最小限の video frame があるかを判定する。
 *
 * `readyState` だけでは Safari / fixture 境界で `0x0` frame が見えることがあるため、2px 未満の幅・高さは
 * 未準備として扱う。失敗時に例外は出さず、caller の frame loop が次 frame を待つ。
 */
export function trackerVideoFrameIsReady(videoElement: HTMLVideoElement): boolean {
    return (
        videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        videoElement.videoWidth >= MIN_DETECTABLE_VIDEO_DIMENSION_PX &&
        videoElement.videoHeight >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
    );
}
