import { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import { loadMediaPipeVisionFileset } from "../trackingRuntime/mediaPipeVisionFileset";
import {
    calculateRoiConsistency,
    createFaceRoiFromPose,
} from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    cloneSincroRoiObservation,
    DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
    type SincroFaceMotionSnapshot,
} from "./sincroFaceMotionSnapshot";
import { createDefaultRoiCropFrame, type SincroFaceRoiCropFactory } from "./sincroFaceRoiCropFrame";
import {
    calculateFaceInferenceFps,
    estimateFaceCenterInFullFrame,
    faceRoiIsUsable,
    runSincroFaceLandmarker,
    type SincroFaceLandmarkerLike,
    uniqueFaceWarnings,
} from "./sincroFaceTrackerHelpers";
import {
    createSincroFaceFallbackSnapshot,
    normalizeSincroFaceLandmarkerResult,
} from "./sincroFaceTrackerNormalizer";

const FACE_LANDMARKER_MODEL_PATH = "/3rd_party/face_landmarker.task";
const ROI_MISSING_WARNING = "roi_missing";

export type SincroFaceDetectWithRoiOptions = Record<never, never>;
export type { SincroFaceRoiCropFactory } from "./sincroFaceRoiCropFrame";
export type { SincroFaceLandmarkerLike } from "./sincroFaceTrackerHelpers";

export type SincroFaceTrackerOptions = {
    faceLandmarker?: SincroFaceLandmarkerLike;
    createCropFrame?: SincroFaceRoiCropFactory;
};

// FaceLandmarker の生結果を、VRM retarget が扱いやすい内部 snapshot へ正規化する。
// DOM や UI 更新は持ち込まず、TrackerRuntime から渡された video frame だけを同期推論する。
export class SincroFaceTracker {
    private faceLandmarker?: SincroFaceLandmarkerLike;
    private initPromise?: Promise<void>;
    private lastFullFrameInferenceEndedAtMs?: number;
    private lastRoiInferenceEndedAtMs?: number;
    private snapshot: SincroFaceMotionSnapshot = {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
        blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
        warnings: [...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.warnings],
    };
    private readonly createCropFrame: SincroFaceRoiCropFactory;

    constructor(options: SincroFaceTrackerOptions = {}) {
        this.createCropFrame = options.createCropFrame ?? createDefaultRoiCropFrame;
        if (options.faceLandmarker) {
            this.faceLandmarker = options.faceLandmarker;
            this.snapshot = {
                ...this.snapshot,
                trackingEnabled: true,
            };
        }
    }

    async initVision(): Promise<void> {
        if (this.faceLandmarker) {
            return;
        }
        if (!this.initPromise) {
            this.initPromise = this.createFaceLandmarker().catch((error) => {
                this.initPromise = undefined;
                this.snapshot = createSincroFaceFallbackSnapshot(
                    "FaceLandmarker の初期化に失敗しました。",
                    performance.now(),
                );
                throw error;
            });
        }
        await this.initPromise;
    }

    modelIsLoaded(): boolean {
        return this.faceLandmarker !== undefined;
    }

    detect(videoFrame: TexImageSource, timestampMs: number): SincroFaceMotionSnapshot {
        if (!this.faceLandmarker) {
            this.snapshot = createSincroFaceFallbackSnapshot(
                "FaceLandmarker model is not loaded.",
                timestampMs,
            );
            return this.snapshot;
        }

        const inferenceStartedAtMs = performance.now();
        const result = this.faceLandmarker.detectForVideo(videoFrame, timestampMs);
        const inferenceEndedAtMs = performance.now();
        const inferenceTimeMs = inferenceEndedAtMs - inferenceStartedAtMs;
        const inferenceFps = calculateFaceInferenceFps({
            lastInferenceEndedAtMs: this.lastFullFrameInferenceEndedAtMs,
            inferenceEndedAtMs,
        });
        this.lastFullFrameInferenceEndedAtMs = inferenceEndedAtMs;
        this.snapshot = normalizeSincroFaceLandmarkerResult({
            result,
            inferenceTimeMs,
            inferenceFps,
            nowMs: timestampMs,
            source: "full-frame",
            warnings: [],
        });
        return this.snapshot;
    }

    detectWithRoi(
        videoFrame: TexImageSource,
        poseSnapshot: SincroPoseMotionSnapshot,
        timestampMs: number,
        options: SincroFaceDetectWithRoiOptions = {},
    ): SincroFaceMotionSnapshot {
        void options;
        if (!this.faceLandmarker) {
            this.snapshot = createSincroFaceFallbackSnapshot(
                "FaceLandmarker model is not loaded.",
                timestampMs,
            );
            return this.snapshot;
        }

        const roi = createFaceRoiFromPose({ pose: poseSnapshot });
        if (!faceRoiIsUsable(roi)) {
            return this.detectFullFrameFallback(videoFrame, timestampMs, roi, roi.warnings);
        }

        const cropFrame = this.createCropFrame({ videoFrame, roi });
        if (cropFrame === undefined) {
            return this.detectFullFrameFallback(videoFrame, timestampMs, roi, [
                ...roi.warnings,
                ROI_MISSING_WARNING,
            ]);
        }

        const roiDetection = this.runFaceLandmarker(cropFrame, timestampMs);
        if (roiDetection.result.faceLandmarks.length === 0) {
            return this.detectFullFrameFallback(
                videoFrame,
                timestampMs,
                roi,
                uniqueFaceWarnings([...roi.warnings, ROI_MISSING_WARNING]),
                roiDetection.inferenceTimeMs,
            );
        }

        const consistency = calculateRoiConsistency({
            expected: roi.referencePoint,
            observed: estimateFaceCenterInFullFrame(roi.rect, roiDetection.result),
        });
        const warnings = uniqueFaceWarnings([...roi.warnings, ...consistency.warnings]);
        if (consistency.score === 0) {
            return this.detectFullFrameFallback(
                videoFrame,
                timestampMs,
                roi,
                warnings,
                roiDetection.inferenceTimeMs,
            );
        }

        const inferenceFps = calculateFaceInferenceFps({
            lastInferenceEndedAtMs: this.lastRoiInferenceEndedAtMs,
            inferenceEndedAtMs: roiDetection.inferenceEndedAtMs,
        });
        this.lastRoiInferenceEndedAtMs = roiDetection.inferenceEndedAtMs;
        this.snapshot = normalizeSincroFaceLandmarkerResult({
            result: roiDetection.result,
            inferenceTimeMs: roiDetection.inferenceTimeMs,
            inferenceFps,
            nowMs: timestampMs,
            source: "roi",
            roi,
            warnings,
        });
        return this.snapshot;
    }

    getSnapshot(): SincroFaceMotionSnapshot {
        return {
            ...this.snapshot,
            headPose: { ...this.snapshot.headPose },
            blendshapes: { ...this.snapshot.blendshapes },
            roi: cloneSincroRoiObservation(this.snapshot.roi),
            warnings: [...this.snapshot.warnings],
        };
    }

    stop(
        reason: string | undefined = undefined,
        nowMs: number = performance.now(),
    ): SincroFaceMotionSnapshot {
        this.snapshot = {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
            blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
            warnings: [...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.warnings],
            fallbackReason: reason,
            lastUpdatedAtMs: nowMs,
        };
        this.lastFullFrameInferenceEndedAtMs = undefined;
        this.lastRoiInferenceEndedAtMs = undefined;
        return this.getSnapshot();
    }

    dispose(): void {
        this.faceLandmarker?.close();
        this.faceLandmarker = undefined;
        this.initPromise = undefined;
        this.stop("FaceLandmarker disposed.");
    }

    private async createFaceLandmarker(): Promise<void> {
        const vision = await loadMediaPipeVisionFileset();
        this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: FACE_LANDMARKER_MODEL_PATH,
                delegate: this.selectFaceLandmarkerDelegate(),
            },
            runningMode: "VIDEO",
            numFaces: 1,
            minFaceDetectionConfidence: 0.5,
            minFacePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
        });
        this.snapshot = {
            ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
            headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
            blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
            warnings: [...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.warnings],
            trackingEnabled: true,
            lastUpdatedAtMs: performance.now(),
        };
    }

    private selectFaceLandmarkerDelegate(): "CPU" | "GPU" {
        return navigator.userAgent.toLowerCase().includes("firefox") ? "CPU" : "GPU";
    }

    private detectFullFrameFallback(
        videoFrame: TexImageSource,
        timestampMs: number,
        roi: SincroRoiObservation,
        warnings: string[],
        previousInferenceTimeMs = 0,
    ): SincroFaceMotionSnapshot {
        if (!this.faceLandmarker) {
            this.snapshot = createSincroFaceFallbackSnapshot(
                "FaceLandmarker model is not loaded.",
                timestampMs,
            );
            return this.snapshot;
        }

        const fallback = this.runFaceLandmarker(videoFrame, timestampMs);
        const inferenceEndedAtMs = fallback.inferenceEndedAtMs;
        const inferenceFps = calculateFaceInferenceFps({
            lastInferenceEndedAtMs: this.lastRoiInferenceEndedAtMs,
            inferenceEndedAtMs,
        });
        this.lastRoiInferenceEndedAtMs = inferenceEndedAtMs;
        this.snapshot = normalizeSincroFaceLandmarkerResult({
            result: fallback.result,
            inferenceTimeMs: previousInferenceTimeMs + fallback.inferenceTimeMs,
            inferenceFps,
            nowMs: timestampMs,
            source: "full-frame-fallback",
            roi,
            warnings: uniqueFaceWarnings(warnings),
        });
        return this.snapshot;
    }

    private runFaceLandmarker(videoFrame: TexImageSource, timestampMs: number) {
        return runSincroFaceLandmarker({
            faceLandmarker: this.faceLandmarker,
            videoFrame,
            timestampMs,
        });
    }
}
