import type { FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { mapCropPointToFullFrame } from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type {
    SincroRoiObservation,
    SincroRoiPoint,
    SincroRoiRect,
} from "../trackingRuntime/roiTracking/roiTrackingTypes";

export type SincroFaceLandmarkerLike = {
    detectForVideo(videoFrame: TexImageSource, timestampMs: number): FaceLandmarkerResult;
    close(): void;
};

export type SincroFaceLandmarkerInference = {
    result: FaceLandmarkerResult;
    inferenceTimeMs: number;
    inferenceEndedAtMs: number;
};

export function runSincroFaceLandmarker(input: {
    faceLandmarker: SincroFaceLandmarkerLike | undefined;
    videoFrame: TexImageSource;
    timestampMs: number;
}): SincroFaceLandmarkerInference {
    const inferenceStartedAtMs = performance.now();
    const result = input.faceLandmarker?.detectForVideo(input.videoFrame, input.timestampMs);
    const inferenceEndedAtMs = performance.now();
    if (result === undefined) {
        throw new Error("FaceLandmarker model is not loaded.");
    }
    return {
        result,
        inferenceTimeMs: inferenceEndedAtMs - inferenceStartedAtMs,
        inferenceEndedAtMs,
    };
}

export function calculateFaceInferenceFps(input: {
    lastInferenceEndedAtMs: number | undefined;
    inferenceEndedAtMs: number;
}): number {
    return input.lastInferenceEndedAtMs === undefined
        ? 0
        : 1000 / Math.max(1, input.inferenceEndedAtMs - input.lastInferenceEndedAtMs);
}

export function faceRoiIsUsable(roi: SincroRoiObservation): boolean {
    return (
        roi.source === "pose-face" &&
        roi.confidence > 0 &&
        roi.rect.width > 0 &&
        roi.rect.height > 0
    );
}

export function estimateFaceCenterInFullFrame(
    roi: SincroRoiRect,
    result: FaceLandmarkerResult,
): SincroRoiPoint | undefined {
    const landmarks = result.faceLandmarks[0];
    if (landmarks === undefined || landmarks.length === 0) {
        return undefined;
    }
    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const landmark of landmarks) {
        if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
            continue;
        }
        sumX += landmark.x;
        sumY += landmark.y;
        count += 1;
    }
    if (count === 0) {
        return undefined;
    }
    return mapCropPointToFullFrame(roi, [sumX / count, sumY / count]);
}

export function uniqueFaceWarnings(warnings: string[]): string[] {
    return warnings.filter((warning, index) => warnings.indexOf(warning) === index);
}
