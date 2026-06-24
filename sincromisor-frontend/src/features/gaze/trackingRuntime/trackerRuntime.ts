import { frontendLogger } from "../../../shared/logging/appLogger";
import { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";
import { shouldRunTrackerInference, shouldRunTrackerPoseInference } from "./trackerRuntimeCadence";
import {
    formatTrackerRuntimeErrorDetail,
    initializeTrackerRuntimeEngine,
} from "./trackerRuntimeEngineInitializer";
import { publishTrackerRuntimeFallbackStats } from "./trackerRuntimeFallbackStats";
import { TrackerRuntimeFrameLoop } from "./trackerRuntimeFrameLoop";
import { TrackerRuntimePosePerformanceGate } from "./trackerRuntimePosePerformanceGate";
import {
    DEFAULT_TARGET_INFERENCE_FPS,
    DEFAULT_TARGET_POSE_INFERENCE_FPS,
    type TrackerRuntimeCallbacks,
    type TrackerRuntimePoseOptions,
    type TrackerVideoFrameTiming,
} from "./trackerRuntimeTypes";
import { attachTrackerVideoTrack, trackerVideoFrameIsReady } from "./trackerRuntimeVideoElement";

// Sincro 用 tracker の camera/video/loop 所有境界。
// tracker core は DOM を知らず、runtime が video frame の readiness と fps 制限を担当する。
export class TrackerRuntime {
    private readonly videoElement: HTMLVideoElement;
    private readonly faceTracker: SincroFaceTracker;
    private readonly poseTracker: SincroPoseTracker;
    private readonly workerClient: SincroTrackerWorkerClient;
    private readonly frameLoop = new TrackerRuntimeFrameLoop((timing) => {
        this.predict(timing);
    });
    private callbacks?: TrackerRuntimeCallbacks;
    private loadedDataHandlerBound?: () => void;
    private lastInferenceAtMs = -1;
    private lastPoseInferenceAtMs = -1;
    private targetInferenceFps = DEFAULT_TARGET_INFERENCE_FPS;
    private targetPoseInferenceFps = DEFAULT_TARGET_POSE_INFERENCE_FPS;
    private readonly posePerformanceGate = new TrackerRuntimePosePerformanceGate();
    private poseTrackingEnabled = false;
    private poseDegradedToFaceOnly = false;
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
        if (this.frameLoop.enabled || this.callbacks) {
            this.stopFaceTracking("sincro_face_tracking_restarting");
        }

        this.callbacks = callbacks;
        this.poseTrackingEnabled = !!poseOptions.enabled;
        this.poseDegradedToFaceOnly = false;
        this.targetInferenceFps = Math.max(1, Math.min(30, targetInferenceFps));
        this.targetPoseInferenceFps = Math.max(
            1,
            Math.min(15, poseOptions.targetInferenceFps ?? DEFAULT_TARGET_POSE_INFERENCE_FPS),
        );
        this.posePerformanceGate.configure({
            targetPoseInferenceFps: this.targetPoseInferenceFps,
            ignorePerformanceFallback: !!poseOptions.ignorePerformanceFallback,
        });
        this.useWorkerTracking = await this.initializeTrackerEngine(true);
        attachTrackerVideoTrack(this.videoElement, videoTrack);
        this.frameLoop.enable();
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
        this.frameLoop.stop();
        if (this.useWorkerTracking) {
            // Restarting with Pose OFF must not keep a Worker that already loaded PoseLandmarker.
            // Disposing here makes the next start honor the current tracking options from a clean Worker.
            this.workerClient.dispose();
        }
        this.callbacks?.onFaceMotion(this.faceTracker.stop(reason));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop(reason));
        this.callbacks = undefined;
        this.poseTrackingEnabled = false;
        this.poseDegradedToFaceOnly = false;
        this.posePerformanceGate.reset();
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

    private async initializeTrackerEngine(preferWorker: boolean): Promise<boolean> {
        return initializeTrackerRuntimeEngine({
            faceTracker: this.faceTracker,
            poseTracker: this.poseTracker,
            workerClient: this.workerClient,
            poseTrackingEnabled: this.poseTrackingEnabled,
            preferWorker,
            onWorkerFallback: (reason) => {
                this.publishMainThreadFallbackStats(reason);
            },
            onPoseInitializationFallback: (reason, nowMs) => {
                this.degradePoseToFaceOnly(reason, nowMs);
            },
        });
    }

    private startLoopIfNeeded(): void {
        this.frameLoop.startIfNeeded(this.videoElement, this.callbacks);
    }

    private predict(timing: TrackerVideoFrameTiming): void {
        if (!this.frameLoop.enabled || !this.callbacks) {
            this.frameLoop.markStopped();
            return;
        }

        const nowMs = timing.mediaTimeMs;
        if (!trackerVideoFrameIsReady(this.videoElement)) {
            this.frameLoop.schedule();
            return;
        }
        if (
            !shouldRunTrackerInference({
                lastInferenceAtMs: this.lastInferenceAtMs,
                targetInferenceFps: this.targetInferenceFps,
                nowMs,
            })
        ) {
            this.frameLoop.schedule();
            return;
        }

        this.lastInferenceAtMs = nowMs;
        if (this.useWorkerTracking) {
            void this.predictWithWorker(timing);
            return;
        }
        try {
            const snapshot = this.faceTracker.detect(this.videoElement, nowMs);
            this.callbacks.onFaceMotion(snapshot, timing);
            if (this.shouldRunPoseInference(nowMs)) {
                this.runPoseInference(timing);
            }
        } catch (error) {
            this.handleRuntimeError(error);
            return;
        }
        this.frameLoop.schedule();
    }

    private async predictWithWorker(timing: TrackerVideoFrameTiming): Promise<void> {
        if (!this.frameLoop.enabled || !this.callbacks) {
            this.frameLoop.markStopped();
            return;
        }
        const nowMs = timing.mediaTimeMs;
        const runPose = this.shouldRunPoseInference(nowMs);
        if (runPose) {
            this.lastPoseInferenceAtMs = nowMs;
        }
        try {
            const transferStartedAtMs = performance.now();
            const frame = await createImageBitmap(this.videoElement);
            const transferTimeMs = performance.now() - transferStartedAtMs;
            const result = await this.workerClient.detect(frame, nowMs, runPose, transferTimeMs);
            if (!this.frameLoop.enabled || !this.callbacks) {
                this.frameLoop.markStopped();
                return;
            }
            this.callbacks.onTrackerStats?.(result.stats);
            this.callbacks.onFaceMotion(result.face, timing);
            if (result.pose) {
                this.callbacks.onPoseMotion?.(result.pose, timing);
                this.applyPosePerformanceGate(result.pose, nowMs, timing);
            }
            this.frameLoop.schedule();
        } catch (error) {
            await this.switchToMainThreadFallback(error);
        }
    }

    private shouldRunPoseInference(nowMs: number): boolean {
        return shouldRunTrackerPoseInference({
            poseTrackingEnabled: this.poseTrackingEnabled,
            poseDegradedToFaceOnly: this.poseDegradedToFaceOnly,
            lastPoseInferenceAtMs: this.lastPoseInferenceAtMs,
            targetPoseInferenceFps: this.targetPoseInferenceFps,
            nowMs,
        });
    }

    private runPoseInference(timing: TrackerVideoFrameTiming): void {
        if (!this.callbacks) {
            return;
        }
        const nowMs = timing.mediaTimeMs;
        this.lastPoseInferenceAtMs = nowMs;
        try {
            const snapshot = this.poseTracker.detect(this.videoElement, nowMs);
            this.callbacks.onPoseMotion?.(snapshot, timing);
            this.applyPosePerformanceGate(snapshot, nowMs, timing);
        } catch (error) {
            frontendLogger.warn(
                "Sincro PoseLandmarker failed during video inference. Falling back to face-only.",
                { error },
            );
            this.degradePoseToFaceOnly(formatTrackerRuntimeErrorDetail(error), nowMs, timing);
        }
    }

    private async switchToMainThreadFallback(error: unknown): Promise<void> {
        if (this.switchingToMainThreadFallback) {
            return;
        }
        this.switchingToMainThreadFallback = true;
        this.publishMainThreadFallbackStats(formatTrackerRuntimeErrorDetail(error));
        this.workerClient.dispose();
        this.useWorkerTracking = false;
        try {
            await this.initializeTrackerEngine(false);
            this.switchingToMainThreadFallback = false;
            if (this.frameLoop.enabled) {
                this.frameLoop.schedule();
            }
        } catch (fallbackError) {
            this.switchingToMainThreadFallback = false;
            this.handleRuntimeError(fallbackError);
        }
    }

    private applyPosePerformanceGate(
        snapshot: SincroPoseMotionSnapshot,
        nowMs: number,
        timing?: TrackerVideoFrameTiming,
    ): void {
        const degradedReason = this.posePerformanceGate.evaluate(snapshot);
        if (degradedReason) {
            this.degradePoseToFaceOnly(degradedReason, nowMs, timing);
        }
    }

    private degradePoseToFaceOnly(
        reason: string,
        nowMs: number,
        timing?: TrackerVideoFrameTiming,
    ): void {
        this.poseDegradedToFaceOnly = true;
        const snapshot = {
            ...this.poseTracker.stop(reason, nowMs),
            degradedToFaceOnly: true,
            fallbackReason: reason,
        };
        this.callbacks?.onPoseMotion?.(snapshot, timing);
        this.callbacks?.onPoseFallback?.(snapshot, timing);
    }

    private handleRuntimeError(error: unknown): void {
        frontendLogger.error("Sincro FaceLandmarker failed during video inference.", { error });
        this.callbacks?.onFaceMotion(this.faceTracker.stop(formatTrackerRuntimeErrorDetail(error)));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onError?.(error);
        this.frameLoop.stop();
    }

    private publishMainThreadFallbackStats(reason: string): void {
        publishTrackerRuntimeFallbackStats(this.callbacks, this.workerClient.getStats(), reason);
    }
}
