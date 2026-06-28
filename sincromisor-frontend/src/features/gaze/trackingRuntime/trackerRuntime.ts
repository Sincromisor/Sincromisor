/**
 * camera track、video element、frame loop、Worker / main-thread fallback を束ねる TrackerRuntime facade。
 * UI 更新と VRM 適用は callback 先の責務に残し、start / stop / dispose が取得 resource の cleanup 境界になる。
 */
import { frontendLogger } from "../../../shared/logging/appLogger";
import { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import { SincroHandTracker } from "../handTracking/sincroHandTracker";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";
import type { SincroTrackerRoiStats, SincroTrackerWorkerStats } from "./sincroTrackerWorkerTypes";
import {
    applyTrackerRuntimeDegradationDecision,
    trackerRuntimePolicyStageStopsPose,
} from "./trackerRuntimeDegradationApplication";
import type {
    TrackerRuntimeDegradationPolicyCadence,
    TrackerRuntimeDegradationPolicyDecision,
} from "./trackerRuntimeDegradationPolicy";
import { TrackerRuntimeDegradationPolicyController } from "./trackerRuntimeDegradationPolicy";
import {
    formatTrackerRuntimeErrorDetail,
    initializeTrackerRuntimeEngine,
} from "./trackerRuntimeEngineInitializer";
import { publishTrackerRuntimeFallbackStats } from "./trackerRuntimeFallbackStats";
import { clampTrackerRuntimeTargetsForMainThreadFallback } from "./trackerRuntimeFpsPolicy";
import { TrackerRuntimeFrameLoop } from "./trackerRuntimeFrameLoop";
import { runTrackerRuntimeMainThreadPipeline } from "./trackerRuntimeMainThreadPipeline";
import type { TrackerPerformanceReasonCode } from "./trackerRuntimePerformanceBudget";
import {
    resolveTrackerRuntimePerformanceProfile,
    type TrackerRuntimePerformanceProfile,
} from "./trackerRuntimePerformanceProfile";
import {
    TrackerRuntimePosePerformanceGate,
    type TrackerRuntimePosePerformanceGateResult,
} from "./trackerRuntimePosePerformanceGate";
import { createTrackerRuntimePredictionPlan } from "./trackerRuntimePredictionPlan";
import { TrackerRuntimeRoiBudgetController } from "./trackerRuntimeRoiBudget";
import { trackerPoseSnapshotIsFresh } from "./trackerRuntimeRoiSnapshot";
import {
    applyTrackerRuntimeStatsBudget,
    createMainThreadTrackerRuntimeStats,
    recordTrackerRuntimeRoiFrame,
    type TrackerRuntimeBudgetInput,
    type TrackerRuntimeRoiFrameInput,
} from "./trackerRuntimeStats";
import {
    createTrackerRuntimeMutableState,
    type TrackerRuntimeCallbacks,
    type TrackerRuntimeMutableState,
    type TrackerRuntimePoseOptions,
    type TrackerVideoFrameTiming,
} from "./trackerRuntimeTypes";
import { attachTrackerVideoTrack, trackerVideoFrameIsReady } from "./trackerRuntimeVideoElement";
import { runTrackerRuntimeWorkerPipeline } from "./trackerRuntimeWorkerPipeline";

type MainThreadPipelineInput = Parameters<typeof runTrackerRuntimeMainThreadPipeline>[0];
type WorkerPipelineInput = Parameters<typeof runTrackerRuntimeWorkerPipeline>[0];

// reason: structure-threshold-exception lifecycle facade と callback adapter を同一 class に残し public API の挙動を固定するため
// TrackerRuntime は DOM の video element、camera track、Worker と推論 lifecycle を所有する。
// UI 更新、VRM 適用、canonical 生成、ReliabilityMap 生成は後段の page / character 層の責務に残す。
export class TrackerRuntime {
    private readonly videoElement: HTMLVideoElement;
    private readonly faceTracker: SincroFaceTracker;
    private readonly poseTracker: SincroPoseTracker;
    private readonly handTracker: SincroHandTracker;
    private readonly workerClient: SincroTrackerWorkerClient;
    private readonly frameLoop = new TrackerRuntimeFrameLoop((timing) => this.predict(timing));
    private readonly posePerformanceGate = new TrackerRuntimePosePerformanceGate();
    private readonly roiBudget = new TrackerRuntimeRoiBudgetController();
    private readonly degradationPolicy = new TrackerRuntimeDegradationPolicyController();
    private callbacks?: TrackerRuntimeCallbacks;
    private loadedDataHandlerBound?: () => void;
    private state: TrackerRuntimeMutableState = createTrackerRuntimeMutableState();
    private performanceProfile: TrackerRuntimePerformanceProfile =
        resolveTrackerRuntimePerformanceProfile().profile;

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
        targetInferenceFps?: number,
        poseOptions: TrackerRuntimePoseOptions = {},
    ): Promise<void> {
        if (this.frameLoop.enabled || this.callbacks) {
            this.stopFaceTracking("sincro_face_tracking_restarting");
        }
        this.resetStartState(callbacks, targetInferenceFps, poseOptions);
        this.state.useWorkerTracking = await this.initializeTrackerEngine(true);
        attachTrackerVideoTrack(this.videoElement, videoTrack);
        this.frameLoop.enable();
        if (!this.loadedDataHandlerBound) {
            this.loadedDataHandlerBound = () => this.startLoopIfNeeded();
            this.videoElement.addEventListener("loadeddata", this.loadedDataHandlerBound);
        }
        this.startLoopIfNeeded();
    }

    stopFaceTracking(reason: string | undefined = "sincro_face_tracking_stopped"): void {
        this.frameLoop.stop();
        if (this.state.useWorkerTracking) {
            this.workerClient.dispose();
        }
        this.callbacks?.onFaceMotion(this.faceTracker.stop(reason));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop(reason));
        this.callbacks?.onHandMotion?.(this.handTracker.stop(reason));
        this.callbacks = undefined;
        this.state = createTrackerRuntimeMutableState();
        this.roiBudget.reset();
        this.degradationPolicy.reset();
        this.posePerformanceGate.reset();
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

    private resetStartState(
        callbacks: TrackerRuntimeCallbacks,
        targetInferenceFps: number | undefined,
        poseOptions: TrackerRuntimePoseOptions,
    ): void {
        const performanceProfile = resolveTrackerRuntimePerformanceProfile({
            performanceProfileId: poseOptions.performanceProfileId,
            performanceProfile: poseOptions.performanceProfile,
        }).profile;
        this.state = createTrackerRuntimeMutableState();
        this.performanceProfile = performanceProfile;
        this.callbacks = callbacks;
        this.state.poseTrackingEnabled = !!poseOptions.enabled;
        this.state.handTrackingEnabled =
            this.state.poseTrackingEnabled && poseOptions.hand?.enabled === true;
        this.state.faceRoiTrackingEnabled =
            this.state.poseTrackingEnabled && poseOptions.faceRoi?.enabled === true;
        this.state.ignorePosePerformanceFallback = !!poseOptions.ignorePerformanceFallback;
        this.state.baseTargetInferenceFps = Math.max(
            1,
            Math.min(30, targetInferenceFps ?? performanceProfile.cadence.faceFps),
        );
        this.state.baseTargetPoseInferenceFps = Math.max(
            1,
            Math.min(15, poseOptions.targetInferenceFps ?? performanceProfile.cadence.poseFps),
        );
        this.state.baseTargetHandInferenceFps = Math.max(
            1,
            Math.min(8, poseOptions.hand?.targetInferenceFps ?? performanceProfile.cadence.handFps),
        );
        this.state.baseTargetFaceRoiInferenceFps = Math.max(
            1,
            Math.min(
                12,
                poseOptions.faceRoi?.targetInferenceFps ?? performanceProfile.cadence.faceRoiFps,
            ),
        );
        this.state.targetInferenceFps = this.state.baseTargetInferenceFps;
        this.state.targetPoseInferenceFps = this.state.baseTargetPoseInferenceFps;
        this.state.targetHandInferenceFps = this.state.baseTargetHandInferenceFps;
        this.state.targetFaceRoiInferenceFps = this.state.baseTargetFaceRoiInferenceFps;
        this.configurePosePerformanceGate();
        this.roiBudget.reset();
        this.degradationPolicy.reset();
    }

    private async initializeTrackerEngine(preferWorker: boolean): Promise<boolean> {
        return initializeTrackerRuntimeEngine({
            faceTracker: this.faceTracker,
            poseTracker: this.poseTracker,
            handTracker: this.handTracker,
            workerClient: this.workerClient,
            poseTrackingEnabled: this.state.poseTrackingEnabled,
            handTrackingEnabled: this.state.handTrackingEnabled,
            faceRoiTrackingEnabled: this.state.faceRoiTrackingEnabled,
            preferWorker,
            onWorkerFallback: (reason) => this.applyMainThreadFallback(reason),
            onPoseInitializationFallback: (reason, nowMs) =>
                this.degradePoseToFaceOnly(reason, nowMs),
        });
    }

    private startLoopIfNeeded(): void {
        this.frameLoop.startIfNeeded(this.videoElement, this.callbacks);
    }

    private predict(timing: TrackerVideoFrameTiming): void {
        const callbacks = this.callbacks;
        if (!this.frameLoop.enabled || !callbacks) {
            this.frameLoop.markStopped();
            return;
        }
        if (!trackerVideoFrameIsReady(this.videoElement)) {
            this.frameLoop.schedule();
            return;
        }
        const plan = this.createPredictionPlan(timing.mediaTimeMs);
        if (!plan.runFace) {
            this.frameLoop.schedule();
            return;
        }
        this.state.lastInferenceAtMs = timing.mediaTimeMs;
        if (this.state.useWorkerTracking) {
            void runTrackerRuntimeWorkerPipeline(
                this.createWorkerPipelineInput(timing, plan, callbacks),
            );
            return;
        }
        runTrackerRuntimeMainThreadPipeline(
            this.createMainThreadPipelineInput(timing, plan, callbacks),
        );
    }

    private createPredictionPlan(nowMs: number) {
        return createTrackerRuntimePredictionPlan({
            nowMs,
            lastInferenceAtMs: this.state.lastInferenceAtMs,
            lastPoseInferenceAtMs: this.state.lastPoseInferenceAtMs,
            lastHandInferenceAtMs: this.state.lastHandInferenceAtMs,
            lastFaceRoiInferenceAtMs: this.state.lastFaceRoiInferenceAtMs,
            targetInferenceFps: this.state.targetInferenceFps,
            targetPoseInferenceFps: this.state.targetPoseInferenceFps,
            targetHandInferenceFps: this.state.targetHandInferenceFps,
            targetFaceRoiInferenceFps: this.state.targetFaceRoiInferenceFps,
            poseTrackingEnabled: this.state.poseTrackingEnabled,
            handTrackingEnabled: this.state.handTrackingEnabled,
            faceRoiTrackingEnabled: this.state.faceRoiTrackingEnabled,
            poseDegradedToFaceOnly: this.state.poseDegradedToFaceOnly,
            poseRecoveryProbeActive: trackerRuntimePolicyStageStopsPose(
                this.degradationPolicy.getState().stage,
            ),
            handRoiPaused: this.roiBudget.handIsPaused(),
            faceRoiPaused: this.roiBudget.faceRoiIsPaused(),
            latestPoseSnapshotIsFresh: trackerPoseSnapshotIsFresh(
                nowMs,
                this.state.latestPoseSnapshot,
            ),
        });
    }

    private createMainThreadPipelineInput(
        timing: TrackerVideoFrameTiming,
        plan: ReturnType<typeof createTrackerRuntimePredictionPlan>,
        callbacks: TrackerRuntimeCallbacks,
    ): MainThreadPipelineInput {
        return {
            videoElement: this.videoElement,
            callbacks,
            faceTracker: this.faceTracker,
            poseTracker: this.poseTracker,
            handTracker: this.handTracker,
            timing,
            plan,
            latestPoseSnapshot: this.state.latestPoseSnapshot,
            handTrackingEnabled: this.state.handTrackingEnabled,
            faceRoiTrackingEnabled: this.state.faceRoiTrackingEnabled,
            handRoiPaused: this.roiBudget.handIsPaused(),
            faceRoiPaused: this.roiBudget.faceRoiIsPaused(),
            setLatestPoseSnapshot: (snapshot?: SincroPoseMotionSnapshot) =>
                (this.state.latestPoseSnapshot = snapshot),
            applyPosePerformanceGate: (snapshot, nowMs, frameTiming) =>
                this.applyPosePerformanceGate(snapshot, nowMs, frameTiming),
            degradePoseToFaceOnly: (reason, nowMs, frameTiming) =>
                this.degradePoseToFaceOnly(reason, nowMs, frameTiming),
            markPoseInference: (nowMs) => (this.state.lastPoseInferenceAtMs = nowMs),
            markHandInference: (nowMs) => (this.state.lastHandInferenceAtMs = nowMs),
            markFaceRoiInference: (nowMs) => (this.state.lastFaceRoiInferenceAtMs = nowMs),
            recordRoiFrame: (frame: TrackerRuntimeRoiFrameInput) => this.recordRoiFrame(frame),
            publishStats: (stats) => {
                callbacks.onTrackerStats?.(
                    this.createMainThreadStats(
                        timing,
                        stats.mainThreadDetectTimeMs,
                        stats.poseInferenceTimeMs,
                        stats.poseDetected,
                        stats.roiStats,
                    ),
                );
            },
            handleRuntimeError: (error) => this.handleRuntimeError(error),
            scheduleFrame: () => this.frameLoop.schedule(),
        };
    }

    private createWorkerPipelineInput(
        timing: TrackerVideoFrameTiming,
        plan: ReturnType<typeof createTrackerRuntimePredictionPlan>,
        callbacks: TrackerRuntimeCallbacks,
    ): WorkerPipelineInput {
        return {
            videoElement: this.videoElement,
            callbacks,
            workerClient: this.workerClient,
            timing,
            plan,
            handTrackingEnabled: this.state.handTrackingEnabled,
            faceRoiTrackingEnabled: this.state.faceRoiTrackingEnabled,
            handRoiPaused: this.roiBudget.handIsPaused(),
            faceRoiPaused: this.roiBudget.faceRoiIsPaused(),
            frameLoopIsEnabled: () => this.frameLoop.enabled,
            markFrameLoopStopped: () => this.frameLoop.markStopped(),
            scheduleFrame: () => this.frameLoop.schedule(),
            markPoseInference: (nowMs) => (this.state.lastPoseInferenceAtMs = nowMs),
            markHandInference: (nowMs) => (this.state.lastHandInferenceAtMs = nowMs),
            markFaceRoiInference: (nowMs) => (this.state.lastFaceRoiInferenceAtMs = nowMs),
            setLatestPoseSnapshot: (snapshot?: SincroPoseMotionSnapshot) =>
                (this.state.latestPoseSnapshot = snapshot),
            applyPosePerformanceGate: (snapshot, nowMs, frameTiming) =>
                this.applyPosePerformanceGate(snapshot, nowMs, frameTiming),
            recordRoiFrame: (frame: TrackerRuntimeRoiFrameInput) => this.recordRoiFrame(frame),
            withBudget: (input) =>
                this.withBudget(
                    input.stats,
                    timing,
                    input.poseInferenceTimeMs,
                    input.poseDetected,
                    input.roiStats,
                ),
            switchToMainThreadFallback: (error) => this.switchToMainThreadFallback(error),
        };
    }

    private async switchToMainThreadFallback(error: unknown): Promise<void> {
        if (this.state.switchingToMainThreadFallback) {
            return;
        }
        this.state.switchingToMainThreadFallback = true;
        this.applyMainThreadFallback(formatTrackerRuntimeErrorDetail(error));
        this.workerClient.dispose();
        this.state.useWorkerTracking = false;
        try {
            await this.initializeTrackerEngine(false);
            this.state.switchingToMainThreadFallback = false;
            if (this.frameLoop.enabled) {
                this.frameLoop.schedule();
            }
        } catch (fallbackError) {
            this.state.switchingToMainThreadFallback = false;
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
        this.state.poseDegradedToFaceOnly = true;
        this.state.degradationState = "face-only";
        this.state.degradationReason = reasonCode;
        this.state.degradationSinceMediaTimeMs = nowMs;
        const snapshot = {
            ...this.poseTracker.stop(reason, nowMs),
            degradedToFaceOnly: true,
            fallbackReason: reason,
        };
        this.callbacks?.onPoseMotion?.(snapshot, timing);
        this.callbacks?.onPoseFallback?.(snapshot, timing);
        this.callbacks?.onHandMotion?.(this.handTracker.stop(reason, nowMs), timing);
        this.state.latestPoseSnapshot = undefined;
    }

    private enterComfortableIdle(timing: TrackerVideoFrameTiming): void {
        this.state.comfortableIdleActive = true;
        this.state.poseDegradedToFaceOnly = true;
        const reason = "tracker_degradation_policy_comfortable_idle";
        const poseSnapshot = this.poseTracker.stop(reason, timing.mediaTimeMs);
        this.callbacks?.onPoseMotion?.(poseSnapshot, timing);
        this.callbacks?.onPoseFallback?.(poseSnapshot, timing);
        this.callbacks?.onHandMotion?.(this.handTracker.stop(reason, timing.mediaTimeMs), timing);
        this.state.latestPoseSnapshot = undefined;
    }

    private handleRuntimeError(error: unknown): void {
        frontendLogger.error("Sincro FaceLandmarker failed during video inference.", { error });
        this.callbacks?.onFaceMotion(this.faceTracker.stop(formatTrackerRuntimeErrorDetail(error)));
        this.callbacks?.onPoseMotion?.(this.poseTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onHandMotion?.(this.handTracker.stop("face_tracking_runtime_error"));
        this.callbacks?.onError?.(error);
        this.frameLoop.stop();
    }

    private applyMainThreadFallback(reason: string): void {
        const targets = clampTrackerRuntimeTargetsForMainThreadFallback(this.state);
        this.state = { ...this.state, ...targets };
        this.configurePosePerformanceGate();
        this.state.degradationState = "main-thread-low-fps";
        this.state.degradationReason = "main_thread_fallback";
        this.state.degradationSinceMediaTimeMs = this.videoElement.currentTime * 1000;
        this.state.mainThreadFallbackReason = reason;
        publishTrackerRuntimeFallbackStats(
            this.callbacks,
            this.workerClient.getStats(),
            reason,
            this.state.targetInferenceFps,
            this.state.targetPoseInferenceFps,
            this.state.targetHandInferenceFps,
            this.state.targetFaceRoiInferenceFps,
            this.roiBudget.getStats(),
        );
    }

    private applyPoseGateResult(
        result: TrackerRuntimePosePerformanceGateResult,
        nowMs: number,
    ): void {
        if (result.state === "full") {
            if (
                !this.state.poseDegradedToFaceOnly &&
                this.state.degradationState !== "main-thread-low-fps"
            ) {
                this.state.degradationState = "full";
                this.state.degradationReason = undefined;
                this.state.degradationSinceMediaTimeMs = undefined;
            }
            return;
        }
        this.state.degradationState = result.state;
        this.state.degradationReason = result.reason;
        this.state.degradationSinceMediaTimeMs = nowMs;
    }

    private createMainThreadStats(
        timing: TrackerVideoFrameTiming,
        mainThreadDetectTimeMs: number,
        poseInferenceTimeMs: number | undefined,
        poseDetected: boolean | undefined,
        roiStats: SincroTrackerRoiStats,
    ): SincroTrackerWorkerStats {
        return createMainThreadTrackerRuntimeStats({
            workerStats: this.workerClient.getStats(),
            state: this.state,
            timing,
            mainThreadDetectTimeMs,
            poseInferenceTimeMs,
            poseDetected,
            roiStats,
            applyBudget: (input) => this.withBudgetFromInput(input),
        });
    }

    private withBudgetFromInput(input: TrackerRuntimeBudgetInput): SincroTrackerWorkerStats {
        return this.withBudget(
            input.stats,
            input.timing,
            input.poseInferenceTimeMs,
            input.poseDetected,
            input.roiStats,
        );
    }

    private withBudget(
        stats: SincroTrackerWorkerStats,
        timing: TrackerVideoFrameTiming,
        poseInferenceTimeMs: number | undefined,
        poseDetected: boolean | undefined,
        roiStats: SincroTrackerRoiStats,
    ): SincroTrackerWorkerStats {
        return applyTrackerRuntimeStatsBudget({
            budgetInput: { stats, timing, poseInferenceTimeMs, poseDetected, roiStats },
            state: this.state,
            performanceProfile: this.performanceProfile,
            degradationPolicy: this.degradationPolicy,
            applyDegradationDecision: (decision, frameTiming) =>
                this.applyDegradationPolicyDecision(decision, frameTiming),
            getState: () => this.state,
            getRoiStats: () => this.roiBudget.getStats(),
        });
    }

    private applyDegradationPolicyDecision(
        decision: TrackerRuntimeDegradationPolicyDecision,
        timing: TrackerVideoFrameTiming,
    ): TrackerRuntimeDegradationPolicyCadence {
        const result = applyTrackerRuntimeDegradationDecision({
            decision,
            state: this.state,
            timing,
        });
        this.state = result.state;
        this.roiBudget.setPolicyPauseState(result.roiPauseState);
        this.configurePosePerformanceGate();
        for (const action of result.actions) {
            if (action === "degrade-to-face-only") {
                this.degradePoseToFaceOnly(
                    "tracker_degradation_policy_face_only",
                    timing.mediaTimeMs,
                    timing,
                    "pose_detection_failed_repeatedly",
                );
            }
            if (action === "enter-comfortable-idle") {
                this.enterComfortableIdle(timing);
            }
        }
        return result.appliedCadence;
    }

    private recordRoiFrame(input: TrackerRuntimeRoiFrameInput): SincroTrackerRoiStats {
        return recordTrackerRuntimeRoiFrame({
            roiBudget: this.roiBudget,
            targetPoseInferenceFps: this.state.targetPoseInferenceFps,
            frame: input,
        });
    }

    private configurePosePerformanceGate(): void {
        this.posePerformanceGate.configure({
            targetPoseInferenceFps: this.state.targetPoseInferenceFps,
            ignorePerformanceFallback: this.state.ignorePosePerformanceFallback,
        });
    }
}
