import type { SincroFaceMotionSnapshot } from "./SincroFaceMotionSnapshot";
import { SincroFaceTracker } from "./SincroFaceTracker";
import type { SincroPoseMotionSnapshot } from "./SincroPoseMotionSnapshot";
import { SincroPoseTracker } from "./SincroPoseTracker";

const MIN_DETECTABLE_VIDEO_DIMENSION_PX = 2;
const DEFAULT_TARGET_INFERENCE_FPS = 15;
const DEFAULT_TARGET_POSE_INFERENCE_FPS = 12;
const POSE_INFERENCE_WARN_MS = 38;
const POSE_INFERENCE_WARN_LIMIT = 4;
const POSE_FAILURE_LIMIT = 18;

export type TrackerRuntimeCallbacks = {
    onFaceMotion: (snapshot: SincroFaceMotionSnapshot) => void;
    onPoseMotion?: (snapshot: SincroPoseMotionSnapshot) => void;
    onPoseFallback?: (snapshot: SincroPoseMotionSnapshot) => void;
    onError?: (error: unknown) => void;
};

// Sincro 用 tracker の camera/video/loop 所有境界。
// tracker core は DOM を知らず、runtime が video frame の readiness と fps 制限を担当する。
export class TrackerRuntime {
    private readonly videoElement: HTMLVideoElement;
    private readonly faceTracker: SincroFaceTracker;
    private readonly poseTracker: SincroPoseTracker;
    private callbacks: TrackerRuntimeCallbacks | null = null;
    private loopEnabled = false;
    private loopRunning = false;
    private predictionFrameId: number | null = null;
    private loadedDataHandlerBound: (() => void) | null = null;
    private lastVideoTime = -1;
    private lastInferenceAtMs = -1;
    private lastPoseInferenceAtMs = -1;
    private targetInferenceFps = DEFAULT_TARGET_INFERENCE_FPS;
    private targetPoseInferenceFps = DEFAULT_TARGET_POSE_INFERENCE_FPS;
    private poseTrackingEnabled = false;
    private poseDegradedToFaceOnly = false;
    private slowPoseInferenceCount = 0;

    constructor(
        videoElement: HTMLVideoElement,
        faceTracker: SincroFaceTracker = new SincroFaceTracker(),
        poseTracker: SincroPoseTracker = new SincroPoseTracker(),
    ) {
        this.videoElement = videoElement;
        this.faceTracker = faceTracker;
        this.poseTracker = poseTracker;
    }

    async startFaceTracking(
        videoTrack: MediaStreamTrack,
        callbacks: TrackerRuntimeCallbacks,
        targetInferenceFps: number = DEFAULT_TARGET_INFERENCE_FPS,
        poseOptions: { enabled?: boolean; targetInferenceFps?: number } = {},
    ): Promise<void> {
        await this.faceTracker.initVision();
        this.callbacks = callbacks;
        this.poseTrackingEnabled = !!poseOptions.enabled;
        this.poseDegradedToFaceOnly = false;
        this.slowPoseInferenceCount = 0;
        if (this.poseTrackingEnabled) {
            try {
                await this.poseTracker.initVision();
            } catch (error) {
                console.warn("Sincro PoseLandmarker initialization failed. Continuing with face-only tracking.", error);
                this.degradePoseToFaceOnly(this.formatErrorDetail(error), performance.now());
            }
        }
        this.targetInferenceFps = Math.max(1, Math.min(30, targetInferenceFps));
        this.targetPoseInferenceFps = Math.max(1, Math.min(15, poseOptions.targetInferenceFps ?? DEFAULT_TARGET_POSE_INFERENCE_FPS));
        this.attachVideoTrack(videoTrack);
        this.loopEnabled = true;
        this.lastVideoTime = -1;
        this.lastInferenceAtMs = -1;
        this.lastPoseInferenceAtMs = -1;
        if (!this.loadedDataHandlerBound) {
            this.loadedDataHandlerBound = () => {
                this.startLoopIfNeeded();
            };
            this.videoElement.addEventListener("loadeddata", this.loadedDataHandlerBound);
        }
        this.startLoopIfNeeded();
    }

    stopFaceTracking(reason: string | null = "sincro_face_tracking_stopped"): void {
        this.stopLoop();
        this.callbacks?.onFaceMotion(this.faceTracker.stop(reason));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop(reason));
        this.callbacks = null;
        this.poseTrackingEnabled = false;
        this.poseDegradedToFaceOnly = false;
        this.videoElement.pause();
        this.videoElement.srcObject = null;
    }

    dispose(): void {
        this.stopFaceTracking("sincro_face_tracking_disposed");
        this.faceTracker.dispose();
    }

    private attachVideoTrack(videoTrack: MediaStreamTrack): void {
        const videoStream = new MediaStream();
        videoStream.addTrack(videoTrack);
        this.videoElement.setAttribute("autoplay", "true");
        this.videoElement.setAttribute("playsinline", "true");
        this.videoElement.setAttribute("muted", "true");
        this.videoElement.srcObject = videoStream;
    }

    private startLoopIfNeeded(): void {
        if (!this.loopEnabled || this.loopRunning || !this.callbacks) {
            return;
        }
        if (this.videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
        }
        this.loopRunning = true;
        this.scheduleNextPrediction();
    }

    private stopLoop(): void {
        this.loopEnabled = false;
        this.loopRunning = false;
        if (this.predictionFrameId != null) {
            window.cancelAnimationFrame(this.predictionFrameId);
            this.predictionFrameId = null;
        }
    }

    private scheduleNextPrediction(): void {
        this.predictionFrameId = window.requestAnimationFrame(() => {
            this.predictionFrameId = null;
            this.predict();
        });
    }

    private predict(): void {
        if (!this.loopEnabled || !this.callbacks) {
            this.loopRunning = false;
            return;
        }

        const nowMs = performance.now();
        if (!this.videoFrameIsReadyForDetection()) {
            this.scheduleNextPrediction();
            return;
        }
        if (!this.shouldRunInference(nowMs)) {
            this.scheduleNextPrediction();
            return;
        }
        if (this.videoElement.currentTime === this.lastVideoTime) {
            void this.videoElement.play();
            this.scheduleNextPrediction();
            return;
        }

        this.lastVideoTime = this.videoElement.currentTime;
        this.lastInferenceAtMs = nowMs;
        try {
            const snapshot = this.faceTracker.detect(this.videoElement, nowMs);
            this.callbacks.onFaceMotion(snapshot);
            if (this.shouldRunPoseInference(nowMs)) {
                this.runPoseInference(nowMs);
            }
        } catch (error) {
            this.handleRuntimeError(error);
            return;
        }
        this.scheduleNextPrediction();
    }

    private shouldRunInference(nowMs: number): boolean {
        if (this.lastInferenceAtMs < 0) {
            return true;
        }
        return nowMs - this.lastInferenceAtMs >= 1000 / this.targetInferenceFps;
    }

    private shouldRunPoseInference(nowMs: number): boolean {
        if (!this.poseTrackingEnabled || this.poseDegradedToFaceOnly) {
            return false;
        }
        if (this.lastPoseInferenceAtMs < 0) {
            return true;
        }
        return nowMs - this.lastPoseInferenceAtMs >= 1000 / this.targetPoseInferenceFps;
    }

    private runPoseInference(nowMs: number): void {
        if (!this.callbacks) {
            return;
        }
        this.lastPoseInferenceAtMs = nowMs;
        try {
            const snapshot = this.poseTracker.detect(this.videoElement, nowMs);
            this.callbacks.onPoseMotion?.(snapshot);
            this.applyPosePerformanceGate(snapshot, nowMs);
        } catch (error) {
            console.warn("Sincro PoseLandmarker failed during video inference. Falling back to face-only.", error);
            this.degradePoseToFaceOnly(this.formatErrorDetail(error), nowMs);
        }
    }

    private applyPosePerformanceGate(snapshot: SincroPoseMotionSnapshot, nowMs: number): void {
        if (snapshot.inferenceTimeMs >= POSE_INFERENCE_WARN_MS) {
            this.slowPoseInferenceCount += 1;
        } else {
            this.slowPoseInferenceCount = 0;
        }
        if (snapshot.consecutiveFailures >= POSE_FAILURE_LIMIT) {
            this.degradePoseToFaceOnly("pose_detection_failed_repeatedly", nowMs);
            return;
        }
        if (this.slowPoseInferenceCount >= POSE_INFERENCE_WARN_LIMIT) {
            this.degradePoseToFaceOnly("pose_inference_too_slow", nowMs);
        }
    }

    private degradePoseToFaceOnly(reason: string, nowMs: number): void {
        this.poseDegradedToFaceOnly = true;
        const snapshot = {
            ...this.poseTracker.stop(reason, nowMs),
            degradedToFaceOnly: true,
            fallbackReason: reason,
        };
        this.callbacks?.onPoseMotion?.(snapshot);
        this.callbacks?.onPoseFallback?.(snapshot);
    }

    private videoFrameIsReadyForDetection(): boolean {
        return (
            this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
            && this.videoElement.videoWidth >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
            && this.videoElement.videoHeight >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
        );
    }

    private handleRuntimeError(error: unknown): void {
        console.error("Sincro FaceLandmarker failed during video inference.", error);
        this.callbacks?.onFaceMotion(this.faceTracker.stop(this.formatErrorDetail(error)));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onError?.(error);
        this.stopLoop();
    }

    private formatErrorDetail(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
