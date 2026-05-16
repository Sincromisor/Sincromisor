type CaptureStreamElement = HTMLVideoElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
};

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
    const element = sourceVideo as CaptureStreamElement;
    const stream = element.captureStream?.() ?? element.mozCaptureStream?.();
    if (!stream) {
        throw new Error("HTMLVideoElement.captureStream() is not supported.");
    }
    return stream;
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        video.addEventListener("loadeddata", () => resolve(), { once: true });
    });
}
