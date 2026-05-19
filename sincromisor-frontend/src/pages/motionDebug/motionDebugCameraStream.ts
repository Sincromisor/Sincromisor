const CAMERA_REQUEST_TIMEOUT_MS = 12000;

export function requestMotionDebugCameraStream(): Promise<MediaStream> {
    let timedOut = false;
    let timeoutId = 0;
    const request = navigator.mediaDevices
        .getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: false,
        })
        .then((stream) => {
            if (timedOut) {
                stream.getTracks().forEach((track) => {
                    track.stop();
                });
            }
            return stream;
        });
    const timeout = new Promise<MediaStream>((_, reject) => {
        timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error(`Camera request timed out after ${CAMERA_REQUEST_TIMEOUT_MS}ms.`));
        }, CAMERA_REQUEST_TIMEOUT_MS);
    });
    return Promise.race([request, timeout]).finally(() => {
        window.clearTimeout(timeoutId);
    });
}
