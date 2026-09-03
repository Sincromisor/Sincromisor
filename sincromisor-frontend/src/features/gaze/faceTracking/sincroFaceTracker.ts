import { FaceLandmarker } from "@mediapipe/tasks-vision";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import {
    serializeFaceLandmarkerResult,
    type TrackerRuntimeMediaPipeRawResult,
} from "../trackingRuntime/mediaPipeRawResultSerializer";
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

/** 将来のROI推論設定を互換性を保って追加するための予約領域。 */
export type SincroFaceDetectWithRoiOptions = Record<never, never>;
export type { SincroFaceRoiCropFactory } from "./sincroFaceRoiCropFrame";
export type { SincroFaceLandmarkerLike } from "./sincroFaceTrackerHelpers";

/** 顔追跡器の実装差し替えとROI切り抜き生成を注入する初期化設定。 */
export type SincroFaceTrackerOptions = {
    faceLandmarker?: SincroFaceLandmarkerLike;
    createCropFrame?: SincroFaceRoiCropFactory;
};

/**
 * FaceLandmarker の生結果を、VRMリターゲットが扱いやすい内部スナップショットへ正規化する。
 *
 * DOMやUI更新は持ち込まず、TrackerRuntimeから渡された映像フレームだけを同期推論する。
 * 同一フレームの追加推論ではMediaPipe用時刻だけを補正し、スナップショットの時刻は映像時刻を維持する。
 */
export class SincroFaceTracker {
    private faceLandmarker?: SincroFaceLandmarkerLike;
    private initPromise?: Promise<void>;
    private lastMediaPipeTimestampMs?: number;
    private lastFullFrameInferenceEndedAtMs?: number;
    private lastRoiInferenceEndedAtMs?: number;
    private lastRawResult?: TrackerRuntimeMediaPipeRawResult["face"];
    private snapshot: SincroFaceMotionSnapshot = {
        ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT,
        headPose: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.headPose },
        blendshapes: { ...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.blendshapes },
        warnings: [...DEFAULT_SINCRO_FACE_MOTION_SNAPSHOT.warnings],
    };
    private readonly createCropFrame: SincroFaceRoiCropFactory;

    /** 指定された実装、または遅延初期化する本番用FaceLandmarkerで追跡器を作る。 */
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

    /** FaceLandmarkerを一度だけ初期化し、失敗時は次回呼び出しで再試行可能にする。 */
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

    /** 推論可能なFaceLandmarkerがあるかを返す。 */
    modelIsLoaded(): boolean {
        return this.faceLandmarker !== undefined;
    }

    /** 全画面の顔推論を実行し、入力された映像時刻を持つスナップショットを返す。 */
    detect(videoFrame: TexImageSource, timestampMs: number): SincroFaceMotionSnapshot {
        if (!this.faceLandmarker) {
            this.snapshot = createSincroFaceFallbackSnapshot(
                "FaceLandmarker model is not loaded.",
                timestampMs,
            );
            this.lastRawResult = undefined;
            return this.snapshot;
        }

        const inference = this.runFaceLandmarker(videoFrame, timestampMs);
        this.lastRawResult = serializeFaceLandmarkerResult(inference.result);
        const inferenceFps = calculateFaceInferenceFps({
            lastInferenceEndedAtMs: this.lastFullFrameInferenceEndedAtMs,
            inferenceEndedAtMs: inference.inferenceEndedAtMs,
        });
        this.lastFullFrameInferenceEndedAtMs = inference.inferenceEndedAtMs;
        this.snapshot = normalizeSincroFaceLandmarkerResult({
            result: inference.result,
            inferenceTimeMs: inference.inferenceTimeMs,
            inferenceFps,
            nowMs: timestampMs,
            source: "full-frame",
            warnings: [],
        });
        return this.snapshot;
    }

    /** 最新の全画面推論結果を、記録可能なMediaPipe形式で返す。 */
    getLastRawResult(): TrackerRuntimeMediaPipeRawResult["face"] | undefined {
        return this.lastRawResult;
    }

    /** Pose由来の顔領域を試し、検出できない場合は同一フレームの全画面推論へ切り替える。 */
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

    /** 呼び出し側で変更しても内部状態へ影響しない現在のスナップショットを返す。 */
    getSnapshot(): SincroFaceMotionSnapshot {
        return {
            ...this.snapshot,
            headPose: { ...this.snapshot.headPose },
            blendshapes: { ...this.snapshot.blendshapes },
            roi: cloneSincroRoiObservation(this.snapshot.roi),
            warnings: [...this.snapshot.warnings],
        };
    }

    /**
     * 公開する追跡状態を停止状態へ戻す。
     *
     * モデルは再利用されるため、MediaPipe用時刻は保持してカメラ再開時の巻き戻りを防ぐ。
     */
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
        this.lastRawResult = undefined;
        return this.getSnapshot();
    }

    /** FaceLandmarkerを解放し、モデルに属する推論時刻と公開状態を初期化する。 */
    dispose(): void {
        this.faceLandmarker?.close();
        this.faceLandmarker = undefined;
        this.initPromise = undefined;
        this.lastMediaPipeTimestampMs = undefined;
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
        this.lastMediaPipeTimestampMs = undefined;
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
            timestampMs: this.nextMediaPipeTimestampMs(timestampMs),
        });
    }

    /**
     * MediaPipeの`VIDEO`グラフが要求する厳密な単調増加へ推論呼び出し時刻を合わせる。
     *
     * 全画面、ROI、代替推論は同じインスタンスを共有するため同一映像時刻になり得る。
     * 補正値はMediaPipe境界だけで使い、記録と推論間隔判定の正本時刻には反映しない。
     */
    private nextMediaPipeTimestampMs(timestampMs: number): number {
        const nextTimestampMs =
            this.lastMediaPipeTimestampMs === undefined
                ? timestampMs
                : Math.max(timestampMs, this.lastMediaPipeTimestampMs + 1);
        this.lastMediaPipeTimestampMs = nextTimestampMs;
        return nextTimestampMs;
    }
}
