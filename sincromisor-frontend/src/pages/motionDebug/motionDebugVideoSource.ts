/**
 * video fixture URL から captureStream 用の HTMLVideoElement / MediaStream を作る境界。
 * fixture load failure は caller に throw し、camera permission や tracker lifecycle とは分ける。
 */
export async function createFixtureVideoStream(url: string): Promise<{
    stream: MediaStream;
    video: HTMLVideoElement;
}> {
    const video = document.createElement("video");
    video.src = url;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    await waitForVideoFrame(video);
    return {
        video,
        stream: captureVideoStream(video),
    };
}

function captureVideoStream(sourceVideo: HTMLVideoElement): MediaStream {
    if ("captureStream" in sourceVideo && typeof sourceVideo.captureStream === "function") {
        return sourceVideo.captureStream();
    }
    if ("mozCaptureStream" in sourceVideo && typeof sourceVideo.mozCaptureStream === "function") {
        return sourceVideo.mozCaptureStream();
    }
    throw new Error("HTMLVideoElement.captureStream() is not supported.");
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
}
