import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";

type DrawableTexImageSource = Exclude<TexImageSource, ImageData>;

export type SincroHandRoiCropFactory = (input: {
    videoFrame: TexImageSource;
    roi: SincroRoiObservation;
}) => TexImageSource | undefined;

export function createDefaultHandRoiCropFrame(input: {
    videoFrame: TexImageSource;
    roi: SincroRoiObservation;
}): TexImageSource | undefined {
    const dimensions = readFrameDimensions(input.videoFrame);
    if (dimensions === undefined || !isDrawableImageSource(input.videoFrame)) {
        return undefined;
    }
    const sourceX = Math.max(
        0,
        Math.round((input.roi.rect.centerX - input.roi.rect.width / 2) * dimensions.width),
    );
    const sourceY = Math.max(
        0,
        Math.round((input.roi.rect.centerY - input.roi.rect.height / 2) * dimensions.height),
    );
    const sourceWidth = Math.max(1, Math.round(input.roi.rect.width * dimensions.width));
    const sourceHeight = Math.max(1, Math.round(input.roi.rect.height * dimensions.height));
    const cropWidth = Math.min(sourceWidth, Math.max(1, dimensions.width - sourceX));
    const cropHeight = Math.min(sourceHeight, Math.max(1, dimensions.height - sourceY));
    const canvas = createCanvasLike(cropWidth, cropHeight);
    if (canvas === undefined) {
        return undefined;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
        return undefined;
    }
    context.drawImage(
        input.videoFrame,
        sourceX,
        sourceY,
        cropWidth,
        cropHeight,
        0,
        0,
        cropWidth,
        cropHeight,
    );
    return canvas;
}

function readFrameDimensions(
    videoFrame: TexImageSource,
): { width: number; height: number } | undefined {
    if ("videoWidth" in videoFrame && "videoHeight" in videoFrame) {
        return normalizeDimensions(videoFrame.videoWidth, videoFrame.videoHeight);
    }
    if ("displayWidth" in videoFrame && "displayHeight" in videoFrame) {
        return normalizeDimensions(videoFrame.displayWidth, videoFrame.displayHeight);
    }
    if ("naturalWidth" in videoFrame && "naturalHeight" in videoFrame) {
        return normalizeDimensions(videoFrame.naturalWidth, videoFrame.naturalHeight);
    }
    if ("width" in videoFrame && "height" in videoFrame) {
        return normalizeDimensions(Number(videoFrame.width), Number(videoFrame.height));
    }
    return undefined;
}

function normalizeDimensions(
    width: number,
    height: number,
): { width: number; height: number } | undefined {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
        return undefined;
    }
    return {
        width,
        height,
    };
}

function createCanvasLike(
    width: number,
    height: number,
): HTMLCanvasElement | OffscreenCanvas | undefined {
    if (typeof OffscreenCanvas !== "undefined") {
        return new OffscreenCanvas(width, height);
    }
    if (typeof document !== "undefined") {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
    }
    return undefined;
}

function isDrawableImageSource(videoFrame: TexImageSource): videoFrame is DrawableTexImageSource {
    return typeof ImageData === "undefined" || !(videoFrame instanceof ImageData);
}
