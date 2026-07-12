/**
 * Worker unavailable / failure 時に main thread で Face / Pose / Hand / Face ROI 推論を進める pipeline。
 * 低 fps clamp と ROI budget を前提に snapshot callback だけを publish し、Worker message contract や DOM lifecycle は扱わない。
 */
import { frontendLogger } from "../../../shared/logging/appLogger";
import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import type { SincroGestureMotionSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import { createSincroGestureFallbackSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import type { SincroGestureTracker } from "../gestureTracking/sincroGestureTracker";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroHandTracker } from "../handTracking/sincroHandTracker";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import { createTrackerRuntimeMediaPipeRawResult } from "./mediaPipeRawResultSerializer";
import type { SincroTrackerRoiStats } from "./sincroTrackerWorkerTypes";
import { formatTrackerRuntimeErrorDetail } from "./trackerRuntimeEngineInitializer";
import type { TrackerRuntimePredictionPlan } from "./trackerRuntimePredictionPlan";
import {
    collectTrackerRoiSkipReasons,
    mergeTrackerFaceRoiMetadata,
    publishTrackerSkippedHandSnapshot,
    resolveFreshTrackerPoseSnapshot,
    resolveTrackerHandSkipReason,
    withPausedTrackerFaceRoiWarning,
} from "./trackerRuntimeRoiSnapshot";
import type { TrackerRuntimeRoiFrameInput } from "./trackerRuntimeStats";
import type { TrackerRuntimeCallbacks, TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

export function runTrackerRuntimeMainThreadPipeline(input: {
    videoElement: HTMLVideoElement;
    callbacks: TrackerRuntimeCallbacks;
    faceTracker: SincroFaceTracker;
    poseTracker: SincroPoseTracker;
    handTracker: SincroHandTracker;
    gestureTracker: SincroGestureTracker;
    timing: TrackerVideoFrameTiming;
    plan: TrackerRuntimePredictionPlan;
    latestPoseSnapshot?: SincroPoseMotionSnapshot;
    handTrackingEnabled: boolean;
    gestureTrackingRequested: boolean;
    gestureTrackingEnabled: boolean;
    faceRoiTrackingEnabled: boolean;
    handRoiPaused: boolean;
    faceRoiPaused: boolean;
    setLatestPoseSnapshot: (snapshot?: SincroPoseMotionSnapshot) => void;
    applyPosePerformanceGate: (
        snapshot: SincroPoseMotionSnapshot,
        nowMs: number,
        timing: TrackerVideoFrameTiming,
    ) => void;
    degradePoseToFaceOnly: (reason: string, nowMs: number, timing: TrackerVideoFrameTiming) => void;
    markPoseInference: (nowMs: number) => void;
    markHandInference: (nowMs: number) => void;
    markGestureInference: (nowMs: number) => void;
    markFaceRoiInference: (nowMs: number) => void;
    recordRoiFrame: (input: TrackerRuntimeRoiFrameInput) => SincroTrackerRoiStats;
    publishStats: (input: {
        mainThreadDetectTimeMs: number;
        gestureInferenceTimeMs?: number;
        poseInferenceTimeMs?: number;
        poseDetected?: boolean;
        roiStats: SincroTrackerRoiStats;
    }) => void;
    handleRuntimeError: (error: unknown) => void;
    scheduleFrame: () => void;
}): void {
    const detectStartedAtMs = performance.now();
    try {
        const poseResult = input.plan.runPose ? runPoseInference(input) : undefined;
        const roiPose = resolveFreshTrackerPoseSnapshot({
            nowMs: input.timing.mediaTimeMs,
            currentPose: poseResult?.snapshot,
            latestPose: input.latestPoseSnapshot,
        });
        const hasFreshPose = roiPose !== undefined;
        const runFaceRoi = input.plan.runFaceRoi && hasFreshPose;
        const runHand = input.plan.runHand && hasFreshPose;
        const faceRoiSnapshot =
            runFaceRoi && roiPose ? runFaceRoiInference(input, roiPose) : undefined;
        const faceSnapshot = runFaceInference(input, roiPose, faceRoiSnapshot);
        input.callbacks.onFaceMotion(faceSnapshot, input.timing);
        const handResult = runHand && roiPose ? runHandInference(input, roiPose) : undefined;
        const gestureResult =
            input.plan.runGesture && handResult
                ? runGestureInference(input, handResult.snapshot)
                : undefined;
        if (!runHand) {
            publishTrackerSkippedHandSnapshot({
                callbacks: input.callbacks,
                handTrackingEnabled: input.handTrackingEnabled,
                timing: input.timing,
                reason: resolveTrackerHandSkipReason(hasFreshPose, input.handRoiPaused),
            });
        }
        if (!input.plan.runGesture && input.plan.gestureSkipReason !== undefined) {
            publishSkippedGestureSnapshot(input, input.plan.gestureSkipReason);
        }
        const roiStats = input.recordRoiFrame({
            handRan: runHand,
            faceRoiRan: runFaceRoi,
            handResult,
            faceRoiSnapshot,
            skippedReasons: collectTrackerRoiSkipReasons({
                handTrackingEnabled: input.handTrackingEnabled,
                faceRoiTrackingEnabled: input.faceRoiTrackingEnabled,
                handPaused: input.handRoiPaused,
                faceRoiPaused: input.faceRoiPaused,
                runHand,
                runFaceRoi,
                hasFreshPoseSnapshot: hasFreshPose,
            }),
        });
        input.publishStats({
            mainThreadDetectTimeMs: performance.now() - detectStartedAtMs,
            gestureInferenceTimeMs: gestureResult?.inferenceTimeMs,
            poseInferenceTimeMs: poseResult?.inferenceTimeMs,
            poseDetected: poseResult?.snapshot.detected,
            roiStats,
        });
    } catch (error) {
        input.handleRuntimeError(error);
        return;
    }
    input.scheduleFrame();
}

function runPoseInference(input: {
    videoElement: HTMLVideoElement;
    callbacks: TrackerRuntimeCallbacks;
    poseTracker: SincroPoseTracker;
    timing: TrackerVideoFrameTiming;
    setLatestPoseSnapshot: (snapshot?: SincroPoseMotionSnapshot) => void;
    applyPosePerformanceGate: (
        snapshot: SincroPoseMotionSnapshot,
        nowMs: number,
        timing: TrackerVideoFrameTiming,
    ) => void;
    degradePoseToFaceOnly: (reason: string, nowMs: number, timing: TrackerVideoFrameTiming) => void;
    markPoseInference: (nowMs: number) => void;
}): { snapshot: SincroPoseMotionSnapshot; inferenceTimeMs: number } | undefined {
    const nowMs = input.timing.mediaTimeMs;
    input.markPoseInference(nowMs);
    try {
        const snapshot = input.poseTracker.detect(input.videoElement, nowMs);
        input.setLatestPoseSnapshot(snapshot);
        const raw = createTrackerRuntimeMediaPipeRawResult({
            pose: input.poseTracker.getLastRawResult(),
            timing: {
                mediaTimeMs: input.timing.mediaTimeMs,
                videoWidth: input.videoElement.videoWidth,
                videoHeight: input.videoElement.videoHeight,
            },
        });
        if (raw !== undefined) {
            input.callbacks.onMediaPipeRawResult?.(raw, input.timing);
        }
        input.callbacks.onPoseMotion?.(snapshot, input.timing);
        input.applyPosePerformanceGate(snapshot, nowMs, input.timing);
        return { snapshot, inferenceTimeMs: snapshot.inferenceTimeMs };
    } catch (error) {
        frontendLogger.warn(
            "Sincro PoseLandmarker failed during video inference. Falling back to face-only.",
            { error },
        );
        input.degradePoseToFaceOnly(formatTrackerRuntimeErrorDetail(error), nowMs, input.timing);
        return undefined;
    }
}

function runHandInference(
    input: {
        videoElement: HTMLVideoElement;
        callbacks: TrackerRuntimeCallbacks;
        handTracker: SincroHandTracker;
        timing: TrackerVideoFrameTiming;
        markHandInference: (nowMs: number) => void;
    },
    poseSnapshot: SincroPoseMotionSnapshot,
): { snapshot: SincroHandMotionSnapshot; inferenceTimeMs: number } {
    const nowMs = input.timing.mediaTimeMs;
    input.markHandInference(nowMs);
    const snapshot = input.handTracker.detect(input.videoElement, poseSnapshot, nowMs);
    input.callbacks.onHandMotion?.(snapshot, input.timing);
    return { snapshot, inferenceTimeMs: snapshot.inferenceTimeMs };
}

function runGestureInference(
    input: {
        videoElement: HTMLVideoElement;
        callbacks: TrackerRuntimeCallbacks;
        gestureTracker: SincroGestureTracker;
        timing: TrackerVideoFrameTiming;
        markGestureInference: (nowMs: number) => void;
    },
    handSnapshot: SincroHandMotionSnapshot,
): { snapshot: SincroGestureMotionSnapshot; inferenceTimeMs: number } {
    const nowMs = input.timing.mediaTimeMs;
    input.markGestureInference(nowMs);
    const snapshot = input.gestureTracker.detect(input.videoElement, handSnapshot, nowMs);
    input.callbacks.onGestureMotion?.(snapshot, input.timing);
    return { snapshot, inferenceTimeMs: snapshot.inferenceTimeMs };
}

function publishSkippedGestureSnapshot(
    input: {
        callbacks: TrackerRuntimeCallbacks;
        gestureTrackingRequested: boolean;
        gestureTrackingEnabled: boolean;
        timing: TrackerVideoFrameTiming;
    },
    reason: NonNullable<TrackerRuntimePredictionPlan["gestureSkipReason"]>,
): void {
    if (!input.gestureTrackingRequested) {
        return;
    }
    input.callbacks.onGestureMotion?.(
        createSincroGestureFallbackSnapshot({
            reason,
            nowMs: input.timing.mediaTimeMs,
            trackingEnabled: input.gestureTrackingEnabled,
        }),
        input.timing,
    );
}

function runFaceInference(
    input: {
        videoElement: HTMLVideoElement;
        faceTracker: SincroFaceTracker;
        timing: TrackerVideoFrameTiming;
        faceRoiTrackingEnabled: boolean;
        faceRoiPaused: boolean;
    },
    poseSnapshot: SincroPoseMotionSnapshot | undefined,
    faceRoiSnapshot: SincroFaceMotionSnapshot | undefined,
): SincroFaceMotionSnapshot {
    const snapshot = input.faceTracker.detect(input.videoElement, input.timing.mediaTimeMs);
    if (faceRoiSnapshot !== undefined) {
        return mergeTrackerFaceRoiMetadata({ snapshot, faceRoiSnapshot });
    }
    if (input.faceRoiTrackingEnabled && input.faceRoiPaused) {
        return withPausedTrackerFaceRoiWarning({ snapshot, poseSnapshot });
    }
    return snapshot;
}

function runFaceRoiInference(
    input: {
        videoElement: HTMLVideoElement;
        faceTracker: SincroFaceTracker;
        timing: TrackerVideoFrameTiming;
        markFaceRoiInference: (nowMs: number) => void;
    },
    poseSnapshot: SincroPoseMotionSnapshot,
): SincroFaceMotionSnapshot {
    const nowMs = input.timing.mediaTimeMs;
    input.markFaceRoiInference(nowMs);
    return input.faceTracker.detectWithRoi(input.videoElement, poseSnapshot, nowMs);
}
