import { frontendLogger } from "../logging/appLogger";
import type { SincroFaceMotionSnapshot } from "./SincroFaceMotionSnapshot";
import { SincroFaceTracker } from "./SincroFaceTracker";
import type { SincroPoseMotionSnapshot } from "./SincroPoseMotionSnapshot";
import { SincroPoseTracker } from "./SincroPoseTracker";
import { SincroTrackerWorkerClient } from "./SincroTrackerWorkerClient";
import type { SincroTrackerWorkerStats } from "./SincroTrackerWorkerTypes";

const MIN_DETECTABLE_VIDEO_DIMENSION_PX = 2;
const DEFAULT_TARGET_INFERENCE_FPS = 15;
const DEFAULT_TARGET_POSE_INFERENCE_FPS = 12;
const MIN_POSE_INFERENCE_WARN_MS = 38;
const POSE_INFERENCE_WARN_BUDGET_RATIO = 0.9;
const POSE_INFERENCE_WARMUP_SAMPLE_LIMIT = 6;
const POSE_INFERENCE_WARN_LIMIT = 4;
const POSE_FAILURE_LIMIT = 18;

export type TrackerRuntimeCallbacks = {
    onFaceMotion: (snapshot: SincroFaceMotionSnapshot) => void;
    onPoseMotion?: (snapshot: SincroPoseMotionSnapshot) => void;
    onPoseFallback?: (snapshot: SincroPoseMotionSnapshot) => void;
    onTrackerStats?: (snapshot: SincroTrackerWorkerStats) => void;
    onError?: (error: unknown) => void;
};

type TrackerRuntimePoseOptions = {
    enabled?: boolean;
    targetInferenceFps?: number;
    ignorePerformanceFallback?: boolean;
};

// Sincro 用 tracker の camera/video/loop 所有境界。
// tracker core は DOM を知らず、runtime が video frame の readiness と fps 制限を担当する。
export class TrackerRuntime {
    private readonly videoElement: HTMLVideoElement;
    private readonly faceTracker: SincroFaceTracker;
    private readonly poseTracker: SincroPoseTracker;
    private readonly workerClient: SincroTrackerWorkerClient;
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
    private ignorePosePerformanceFallback = false;
    private poseInferenceSampleCount = 0;
    private slowPoseInferenceCount = 0;
    private useWorkerTracking = false;
    private switchingToMainThreadFallback = false;

    constructor(
        videoElement: HTMLVideoElement,
        faceTracker: SincroFaceTracker = new SincroFaceTracker(),
        poseTracker: SincroPoseTracker = new SincroPoseTracker(),
    ) {
        this.videoElement = videoElement;
        this.faceTracker = faceTracker;
        this.poseTracker = poseTracker;
        this.workerClient = new SincroTrackerWorkerClient((stats) => {
            this.callbacks?.onTrackerStats?.(stats);
        });
    }

    async startFaceTracking(
        videoTrack: MediaStreamTrack,
        callbacks: TrackerRuntimeCallbacks,
        targetInferenceFps: number = DEFAULT_TARGET_INFERENCE_FPS,
        poseOptions: TrackerRuntimePoseOptions = {},
    ): Promise<void> {
        if (this.loopEnabled || this.callbacks) {
            this.stopFaceTracking("sincro_face_tracking_restarting");
        }

        this.callbacks = callbacks;
        this.poseTrackingEnabled = !!poseOptions.enabled;
        this.poseDegradedToFaceOnly = false;
        this.ignorePosePerformanceFallback = !!poseOptions.ignorePerformanceFallback;
        this.poseInferenceSampleCount = 0;
        this.slowPoseInferenceCount = 0;
        this.targetInferenceFps = Math.max(1, Math.min(30, targetInferenceFps));
        this.targetPoseInferenceFps = Math.max(
            1,
            Math.min(15, poseOptions.targetInferenceFps ?? DEFAULT_TARGET_POSE_INFERENCE_FPS),
        );
        await this.initializeTrackingEngine();
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

    stopFaceTracking(reason: string | undefined = "sincro_face_tracking_stopped"): void {
        this.stopLoop();
        if (this.useWorkerTracking) {
            // Restarting with Pose OFF must not keep a Worker that already loaded PoseLandmarker.
            // Disposing here makes the next start honor the current tracking options from a clean Worker.
            this.workerClient.dispose();
        }
        this.callbacks?.onFaceMotion(this.faceTracker.stop(reason));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop(reason));
        this.callbacks = null;
        this.poseTrackingEnabled = false;
        this.poseDegradedToFaceOnly = false;
        this.ignorePosePerformanceFallback = false;
        this.poseInferenceSampleCount = 0;
        this.slowPoseInferenceCount = 0;
        this.useWorkerTracking = false;
        this.switchingToMainThreadFallback = false;
        this.videoElement.pause();
        this.videoElement.srcObject = null;
    }

    dispose(): void {
        this.stopFaceTracking("sincro_face_tracking_disposed");
        this.faceTracker.dispose();
        this.poseTracker.dispose();
        this.workerClient.dispose();
    }

    private async initializeTrackingEngine(): Promise<void> {
        if (SincroTrackerWorkerClient.isSupported()) {
            try {
                await this.workerClient.init(this.poseTrackingEnabled);
                this.useWorkerTracking = true;
                return;
            } catch (error) {
                frontendLogger.warn(
                    "Sincro tracker worker initialization failed. Falling back to main-thread tracking.",
                    { error },
                );
                this.publishMainThreadFallbackStats(this.formatErrorDetail(error));
            }
        } else {
            this.publishMainThreadFallbackStats("worker_or_createImageBitmap_unavailable");
        }
        await this.initializeMainThreadTrackers();
        this.useWorkerTracking = false;
    }

    private async initializeMainThreadTrackers(): Promise<void> {
        await this.faceTracker.initVision();
        if (!this.poseTrackingEnabled) {
            return;
        }
        try {
            await this.poseTracker.initVision();
        } catch (error) {
            frontendLogger.warn(
                "Sincro PoseLandmarker initialization failed. Continuing with face-only tracking.",
                { error },
            );
            this.degradePoseToFaceOnly(this.formatErrorDetail(error), performance.now());
        }
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
        if (this.useWorkerTracking) {
            void this.predictWithWorker(nowMs);
            return;
        }
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

    private async predictWithWorker(nowMs: number): Promise<void> {
        if (!this.loopEnabled || !this.callbacks) {
            this.loopRunning = false;
            return;
        }
        const runPose = this.shouldRunPoseInference(nowMs);
        if (runPose) {
            this.lastPoseInferenceAtMs = nowMs;
        }
        try {
            const transferStartedAtMs = performance.now();
            const frame = await createImageBitmap(this.videoElement);
            const transferTimeMs = performance.now() - transferStartedAtMs;
            const result = await this.workerClient.detect(frame, nowMs, runPose, transferTimeMs);
            this.callbacks.onTrackerStats?.(result.stats);
            this.callbacks.onFaceMotion(result.face);
            if (result.pose) {
                this.callbacks.onPoseMotion?.(result.pose);
                this.applyPosePerformanceGate(result.pose, nowMs);
            }
            this.scheduleNextPrediction();
        } catch (error) {
            await this.switchToMainThreadFallback(error);
        }
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
            frontendLogger.warn(
                "Sincro PoseLandmarker failed during video inference. Falling back to face-only.",
                { error },
            );
            this.degradePoseToFaceOnly(this.formatErrorDetail(error), nowMs);
        }
    }

    private async switchToMainThreadFallback(error: unknown): Promise<void> {
        if (this.switchingToMainThreadFallback) {
            return;
        }
        this.switchingToMainThreadFallback = true;
        this.publishMainThreadFallbackStats(this.formatErrorDetail(error));
        this.workerClient.dispose();
        this.useWorkerTracking = false;
        try {
            await this.initializeMainThreadTrackers();
            this.switchingToMainThreadFallback = false;
            if (this.loopEnabled) {
                this.scheduleNextPrediction();
            }
        } catch (fallbackError) {
            this.switchingToMainThreadFallback = false;
            this.handleRuntimeError(fallbackError);
        }
    }

    private applyPosePerformanceGate(snapshot: SincroPoseMotionSnapshot, nowMs: number): void {
        if (snapshot.consecutiveFailures >= POSE_FAILURE_LIMIT) {
            this.degradePoseToFaceOnly("pose_detection_failed_repeatedly", nowMs);
            return;
        }
        if (this.ignorePosePerformanceFallback) {
            // 低性能 GPU での調整中は 10fps 未満でも姿勢 snapshot を観測し続けたい。
            // hard failure は別 gate に残し、性能 gate だけを明示設定でバイパスする。
            this.slowPoseInferenceCount = 0;
            return;
        }
        this.poseInferenceSampleCount += 1;
        if (this.poseInferenceSampleCount <= POSE_INFERENCE_WARMUP_SAMPLE_LIMIT) {
            // MediaPipe の初回 video 推論には wasm / GPU delegate のウォームアップが混ざる。
            // 起動コストを常時性能不足と誤認しないよう、安定後のサンプルだけで降格判定する。
            this.slowPoseInferenceCount = 0;
            return;
        }
        if (snapshot.inferenceTimeMs >= this.poseInferenceWarnMs()) {
            this.slowPoseInferenceCount += 1;
        } else {
            this.slowPoseInferenceCount = 0;
        }
        if (this.slowPoseInferenceCount >= POSE_INFERENCE_WARN_LIMIT) {
            this.degradePoseToFaceOnly("pose_inference_too_slow", nowMs);
        }
    }

    private poseInferenceWarnMs(): number {
        const targetIntervalMs = 1000 / this.targetPoseInferenceFps;
        return Math.max(
            MIN_POSE_INFERENCE_WARN_MS,
            targetIntervalMs * POSE_INFERENCE_WARN_BUDGET_RATIO,
        );
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
            this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            this.videoElement.videoWidth >= MIN_DETECTABLE_VIDEO_DIMENSION_PX &&
            this.videoElement.videoHeight >= MIN_DETECTABLE_VIDEO_DIMENSION_PX
        );
    }

    private handleRuntimeError(error: unknown): void {
        frontendLogger.error("Sincro FaceLandmarker failed during video inference.", { error });
        this.callbacks?.onFaceMotion(this.faceTracker.stop(this.formatErrorDetail(error)));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onError?.(error);
        this.stopLoop();
    }

    private publishMainThreadFallbackStats(reason: string): void {
        this.callbacks?.onTrackerStats?.({
            mode: "fallback",
            status: "fallback",
            transferTimeMs: 0,
            workerRoundTripMs: 0,
            loadTimeMs: this.workerClient.getStats().loadTimeMs,
            droppedFrames: this.workerClient.getStats().droppedFrames,
            fallbackReason: reason,
        });
    }

    private formatErrorDetail(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
