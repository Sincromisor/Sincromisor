/**
 * motion-debug canvas / video overlay の screenshot capture を担当する DOM utility。
 * capture は developer 操作用の一時 artifact であり、motion-debug NDJSON recording contract には影響しない。
 */
export class MotionDebugFrameCapture {
    private lastCapturedAtMs?: number;

    capture(video: HTMLVideoElement, overlayCanvas: HTMLCanvasElement): string {
        const canvas = document.createElement("canvas");
        canvas.width = positiveDimensionOrDefault(video.videoWidth, video.clientWidth, 2);
        canvas.height = positiveDimensionOrDefault(video.videoHeight, video.clientHeight, 2);
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("2D canvas context is not available.");
        }
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            context.translate(canvas.width, 0);
            context.scale(-1, 1);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            context.drawImage(overlayCanvas, 0, 0, canvas.width, canvas.height);
        }
        this.lastCapturedAtMs = performance.now();
        return canvas.toDataURL("image/png");
    }

    lastFrameCapturedAtMs(): number | undefined {
        return this.lastCapturedAtMs;
    }
}

function positiveDimensionOrDefault(...values: number[]): number {
    return values.find((value) => value > 0) ?? 2;
}
