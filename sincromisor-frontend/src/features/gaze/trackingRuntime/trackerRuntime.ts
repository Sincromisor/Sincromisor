import { frontendLogger } from "../../../shared/logging/appLogger";
import { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import { SincroHandTracker } from "../handTracking/sincroHandTracker";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";
import type { SincroTrackerWorkerStats } from "./sincroTrackerWorkerTypes";
import {
    shouldRunTrackerHandInference,
    shouldRunTrackerInference,
    shouldRunTrackerPoseInference,
} from "./trackerRuntimeCadence";
import {
    formatTrackerRuntimeErrorDetail,
    initializeTrackerRuntimeEngine,
} from "./trackerRuntimeEngineInitializer";
import { publishTrackerRuntimeFallbackStats } from "./trackerRuntimeFallbackStats";
import { TrackerRuntimeFrameLoop } from "./trackerRuntimeFrameLoop";
import {
    createTrackerPerformanceBudgetReport,
    type TrackerPerformanceReasonCode,
    type TrackerRuntimeDegradationState,
} from "./trackerRuntimePerformanceBudget";
import {
    TrackerRuntimePosePerformanceGate,
    type TrackerRuntimePosePerformanceGateResult,
} from "./trackerRuntimePosePerformanceGate";
import {
    DEFAULT_TARGET_HAND_INFERENCE_FPS,
    DEFAULT_TARGET_INFERENCE_FPS,
    DEFAULT_TARGET_POSE_INFERENCE_FPS,
    type TrackerRuntimeCallbacks,
    type TrackerRuntimePoseOptions,
    type TrackerVideoFrameTiming,
} from "./trackerRuntimeTypes";
import { attachTrackerVideoTrack, trackerVideoFrameIsReady } from "./trackerRuntimeVideoElement";

const MAIN_THREAD_FALLBACK_FACE_FPS_LIMIT = 8;
const MAIN_THREAD_FALLBACK_POSE_FPS_LIMIT = 4;
const MAIN_THREAD_FALLBACK_HAND_FPS_LIMIT = 4;

// Sincro 用 tracker の camera/video/loop 所有境界。
// tracker core は DOM を知らず、runtime が video frame の readiness と fps 制限を担当する。
export class TrackerRuntime {
    private readonly videoElement: HTMLVideoElement;
    private readonly faceTracker: SincroFaceTracker;
    private readonly poseTracker: SincroPoseTracker;
    private readonly handTracker: SincroHandTracker;
    private readonly workerClient: SincroTrackerWorkerClient;
    private readonly frameLoop = new TrackerRuntimeFrameLoop((timing) => {
        this.predict(timing);
    });
    private callbacks?: TrackerRuntimeCallbacks;
    private loadedDataHandlerBound?: () => void;
    private lastInferenceAtMs = -1;
    private lastPoseInferenceAtMs = -1;
    private lastHandInferenceAtMs = -1;
    private targetInferenceFps = DEFAULT_TARGET_INFERENCE_FPS;
    private targetPoseInferenceFps = DEFAULT_TARGET_POSE_INFERENCE_FPS;
    private targetHandInferenceFps = DEFAULT_TARGET_HAND_INFERENCE_FPS;
    private readonly posePerformanceGate = new TrackerRuntimePosePerformanceGate();
    private poseTrackingEnabled = false;
    private handTrackingEnabled = false;
    private poseDegradedToFaceOnly = false;
    private useWorkerTracking = false;
    private switchingToMainThreadFallback = false;
    private degradationState: TrackerRuntimeDegradationState = "full";
    private degradationReason?: TrackerPerformanceReasonCode;
    private degradationSinceMediaTimeMs?: number;
    private mainThreadFallbackReason?: string;
    private ignorePosePerformanceFallback = false;

    constructor(
        videoElement: HTMLVideoElement,
        faceTracker: SincroFaceTracker = new SincroFaceTracker(),
        poseTracker: SincroPoseTracker = new SincroPoseTracker(),
        handTracker: SincroHandTracker = new SincroHandTracker(),
    ) {
        this.videoElement = videoElement;
        this.faceTracker = faceTracker;
        this.poseTracker = poseTracker;
        this.handTracker = handTracker;
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
        this.handTrackingEnabled =
            this.poseTrackingEnabled === true && poseOptions.hand?.enabled === true;
        this.poseDegradedToFaceOnly = false;
        this.degradationState = "full";
        this.degradationReason = undefined;
        this.degradationSinceMediaTimeMs = undefined;
        this.mainThreadFallbackReason = undefined;
        this.ignorePosePerformanceFallback = !!poseOptions.ignorePerformanceFallback;
        this.targetInferenceFps = Math.max(1, Math.min(30, targetInferenceFps));
        this.targetPoseInferenceFps = Math.max(
            1,
            Math.min(15, poseOptions.targetInferenceFps ?? DEFAULT_TARGET_POSE_INFERENCE_FPS),
        );
        this.targetHandInferenceFps = Math.max(
            1,
            Math.min(8, poseOptions.hand?.targetInferenceFps ?? DEFAULT_TARGET_HAND_INFERENCE_FPS),
        );
        this.posePerformanceGate.configure({
            targetPoseInferenceFps: this.targetPoseInferenceFps,
            ignorePerformanceFallback: this.ignorePosePerformanceFallback,
        });
        this.useWorkerTracking = await this.initializeTrackerEngine(true);
        attachTrackerVideoTrack(this.videoElement, videoTrack);
        this.frameLoop.enable();
        this.lastInferenceAtMs = -1;
        this.lastPoseInferenceAtMs = -1;
        this.lastHandInferenceAtMs = -1;
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
        this.callbacks?.onHandMotion?.(this.handTracker.stop(reason));
        this.callbacks = undefined;
        this.poseTrackingEnabled = false;
        this.handTrackingEnabled = false;
        this.poseDegradedToFaceOnly = false;
        this.posePerformanceGate.reset();
        this.useWorkerTracking = false;
        this.switchingToMainThreadFallback = false;
        this.degradationState = "full";
        this.degradationReason = undefined;
        this.degradationSinceMediaTimeMs = undefined;
        this.mainThreadFallbackReason = undefined;
        this.ignorePosePerformanceFallback = false;
        this.videoElement.pause();
        this.videoElement.srcObject = null;
    }

    dispose(): void {
        this.stopFaceTracking("sincro_face_tracking_disposed");
        this.faceTracker.dispose();
        this.poseTracker.dispose();
        this.handTracker.dispose();
        this.workerClient.dispose();
    }

    private async initializeTrackerEngine(preferWorker: boolean): Promise<boolean> {
        return initializeTrackerRuntimeEngine({
            faceTracker: this.faceTracker,
            poseTracker: this.poseTracker,
            handTracker: this.handTracker,
            workerClient: this.workerClient,
            poseTrackingEnabled: this.poseTrackingEnabled,
            handTrackingEnabled: this.handTrackingEnabled,
            preferWorker,
            onWorkerFallback: (reason) => {
                this.applyMainThreadFallback(reason);
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
        const detectStartedAtMs = performance.now();
        try {
            const poseResult = this.shouldRunPoseInference(nowMs)
                ? this.runPoseInference(timing)
                : undefined;
            const snapshot =
                poseResult && !this.poseDegradedToFaceOnly
                    ? this.faceTracker.detectWithRoi(this.videoElement, poseResult.snapshot, nowMs)
                    : this.faceTracker.detect(this.videoElement, nowMs);
            this.callbacks.onFaceMotion(snapshot, timing);
            if (poseResult && this.shouldRunHandInference(nowMs)) {
                this.runHandInference(timing, poseResult.snapshot);
            }
            this.callbacks.onTrackerStats?.(
                this.createMainThreadStats(
                    timing,
                    performance.now() - detectStartedAtMs,
                    poseResult?.inferenceTimeMs,
                ),
            );
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
        const runHand = runPose && this.shouldRunHandInference(nowMs);
        if (runPose) {
            this.lastPoseInferenceAtMs = nowMs;
        }
        if (runHand) {
            this.lastHandInferenceAtMs = nowMs;
        }
        try {
            const transferStartedAtMs = performance.now();
            const frame = await createImageBitmap(this.videoElement);
            const transferTimeMs = performance.now() - transferStartedAtMs;
            const result = await this.workerClient.detect(
                frame,
                nowMs,
                runPose,
                runHand,
                transferTimeMs,
            );
            if (!this.frameLoop.enabled || !this.callbacks) {
                this.frameLoop.markStopped();
                return;
            }
            this.callbacks.onFaceMotion(result.face, timing);
            if (result.pose) {
                this.callbacks.onPoseMotion?.(result.pose, timing);
                this.applyPosePerformanceGate(result.pose, nowMs, timing);
            }
            if (result.hand) {
                this.callbacks.onHandMotion?.(result.hand, timing);
            }
            this.callbacks.onTrackerStats?.(
                this.withBudget(result.stats, timing, result.pose?.inferenceTimeMs),
            );
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

    private shouldRunHandInference(nowMs: number): boolean {
        return shouldRunTrackerHandInference({
            handTrackingEnabled: this.handTrackingEnabled,
            poseDegradedToFaceOnly: this.poseDegradedToFaceOnly,
            lastHandInferenceAtMs: this.lastHandInferenceAtMs,
            targetHandInferenceFps: this.targetHandInferenceFps,
            nowMs,
        });
    }

    private runPoseInference(
        timing: TrackerVideoFrameTiming,
    ): { snapshot: SincroPoseMotionSnapshot; inferenceTimeMs: number } | undefined {
        if (!this.callbacks) {
            return undefined;
        }
        const nowMs = timing.mediaTimeMs;
        this.lastPoseInferenceAtMs = nowMs;
        try {
            const snapshot = this.poseTracker.detect(this.videoElement, nowMs);
            this.callbacks.onPoseMotion?.(snapshot, timing);
            this.applyPosePerformanceGate(snapshot, nowMs, timing);
            return {
                snapshot,
                inferenceTimeMs: snapshot.inferenceTimeMs,
            };
        } catch (error) {
            frontendLogger.warn(
                "Sincro PoseLandmarker failed during video inference. Falling back to face-only.",
                { error },
            );
            this.degradePoseToFaceOnly(formatTrackerRuntimeErrorDetail(error), nowMs, timing);
            return undefined;
        }
    }

    private runHandInference(
        timing: TrackerVideoFrameTiming,
        poseSnapshot: SincroPoseMotionSnapshot,
    ): { snapshot: SincroHandMotionSnapshot; inferenceTimeMs: number } | undefined {
        if (!this.callbacks) {
            return undefined;
        }
        const nowMs = timing.mediaTimeMs;
        this.lastHandInferenceAtMs = nowMs;
        const snapshot = this.handTracker.detect(this.videoElement, poseSnapshot, nowMs);
        this.callbacks.onHandMotion?.(snapshot, timing);
        return {
            snapshot,
            inferenceTimeMs: snapshot.inferenceTimeMs,
        };
    }

    private async switchToMainThreadFallback(error: unknown): Promise<void> {
        if (this.switchingToMainThreadFallback) {
            return;
        }
        this.switchingToMainThreadFallback = true;
        this.applyMainThreadFallback(formatTrackerRuntimeErrorDetail(error));
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
        const result = this.posePerformanceGate.evaluate(snapshot);
        this.applyPoseGateResult(result, nowMs);
        if (result.shouldDegradeToFaceOnly && result.fallbackReason) {
            this.degradePoseToFaceOnly(result.fallbackReason, nowMs, timing, result.reason);
        }
    }

    private degradePoseToFaceOnly(
        reason: string,
        nowMs: number,
        timing?: TrackerVideoFrameTiming,
        reasonCode?: TrackerPerformanceReasonCode,
    ): void {
        this.poseDegradedToFaceOnly = true;
        this.degradationState = "face-only";
        this.degradationReason = reasonCode;
        this.degradationSinceMediaTimeMs = nowMs;
        const snapshot = {
            ...this.poseTracker.stop(reason, nowMs),
            degradedToFaceOnly: true,
            fallbackReason: reason,
        };
        this.callbacks?.onPoseMotion?.(snapshot, timing);
        this.callbacks?.onPoseFallback?.(snapshot, timing);
        this.callbacks?.onHandMotion?.(this.handTracker.stop(reason, nowMs), timing);
    }

    private handleRuntimeError(error: unknown): void {
        frontendLogger.error("Sincro FaceLandmarker failed during video inference.", { error });
        this.callbacks?.onFaceMotion(this.faceTracker.stop(formatTrackerRuntimeErrorDetail(error)));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onHandMotion?.(this.handTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onError?.(error);
        this.frameLoop.stop();
    }

    private publishMainThreadFallbackStats(reason: string): void {
        publishTrackerRuntimeFallbackStats(
            this.callbacks,
            this.workerClient.getStats(),
            reason,
            this.targetInferenceFps,
            this.targetPoseInferenceFps,
            this.targetHandInferenceFps,
        );
    }

    private applyMainThreadFallback(reason: string): void {
        this.targetInferenceFps = Math.min(
            this.targetInferenceFps,
            MAIN_THREAD_FALLBACK_FACE_FPS_LIMIT,
        );
        this.targetPoseInferenceFps = Math.min(
            this.targetPoseInferenceFps,
            MAIN_THREAD_FALLBACK_POSE_FPS_LIMIT,
        );
        this.targetHandInferenceFps = Math.min(
            this.targetHandInferenceFps,
            MAIN_THREAD_FALLBACK_HAND_FPS_LIMIT,
        );
        this.posePerformanceGate.configure({
            targetPoseInferenceFps: this.targetPoseInferenceFps,
            ignorePerformanceFallback: this.ignorePosePerformanceFallback,
        });
        this.degradationState = "main-thread-low-fps";
        this.degradationReason = "main_thread_fallback";
        this.degradationSinceMediaTimeMs = this.videoElement.currentTime * 1000;
        this.mainThreadFallbackReason = reason;
        this.publishMainThreadFallbackStats(reason);
    }

    private applyPoseGateResult(
        result: TrackerRuntimePosePerformanceGateResult,
        nowMs: number,
    ): void {
        if (result.state === "full") {
            if (!this.poseDegradedToFaceOnly && this.degradationState !== "main-thread-low-fps") {
                this.degradationState = "full";
                this.degradationReason = undefined;
                this.degradationSinceMediaTimeMs = undefined;
            }
            return;
        }
        this.degradationState = result.state;
        this.degradationReason = result.reason;
        this.degradationSinceMediaTimeMs = nowMs;
    }

    private createMainThreadStats(
        timing: TrackerVideoFrameTiming,
        mainThreadDetectTimeMs: number,
        poseInferenceTimeMs: number | undefined,
    ): SincroTrackerWorkerStats {
        const workerStats = this.workerClient.getStats();
        return this.withBudget(
            {
                mode: "main-thread",
                status: this.mainThreadFallbackReason === undefined ? "running" : "fallback",
                transferTimeMs: 0,
                workerRoundTripMs: 0,
                mainThreadDetectTimeMs,
                loadTimeMs: workerStats.loadTimeMs,
                droppedFrames: workerStats.droppedFrames,
                fallbackReason: this.mainThreadFallbackReason,
                effectiveFaceFps: this.targetInferenceFps,
                effectivePoseFps: this.targetPoseInferenceFps,
                effectiveHandFps: this.handTrackingEnabled
                    ? this.targetHandInferenceFps
                    : undefined,
            },
            timing,
            poseInferenceTimeMs,
        );
    }

    private withBudget(
        stats: SincroTrackerWorkerStats,
        timing: TrackerVideoFrameTiming,
        poseInferenceTimeMs: number | undefined,
    ): SincroTrackerWorkerStats {
        const effectiveFaceFps = stats.effectiveFaceFps ?? this.targetInferenceFps;
        const effectivePoseFps = stats.effectivePoseFps ?? this.targetPoseInferenceFps;
        const effectiveHandFps =
            stats.effectiveHandFps ??
            (this.handTrackingEnabled ? this.targetHandInferenceFps : undefined);
        const fallbackReason = stats.fallbackReason ?? this.mainThreadFallbackReason;
        return {
            ...stats,
            effectiveFaceFps,
            effectivePoseFps,
            effectiveHandFps,
            budget: createTrackerPerformanceBudgetReport({
                targetInferenceFps: this.targetInferenceFps,
                targetPoseInferenceFps: this.targetPoseInferenceFps,
                clockSource: timing.source,
                transferTimeMs: stats.transferTimeMs,
                workerRoundTripMs: stats.workerRoundTripMs,
                workerTimeMs: stats.workerTimeMs,
                mainThreadDetectTimeMs: stats.mainThreadDetectTimeMs,
                poseInferenceTimeMs,
                droppedFrames: stats.droppedFrames,
                effectiveFaceFps,
                effectivePoseFps,
                degradationState: this.degradationState,
                degradationReason: this.degradationReason,
                degradationSinceMediaTimeMs: this.degradationSinceMediaTimeMs,
                fallbackReason,
            }),
        };
    }
}
