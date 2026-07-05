/**
 * ImageBitmap transfer を使う Worker 推論 pipeline。
 *
 * video frame の transfer cost を Worker stats へ渡し、Worker detect / transfer failure は例外で止めず
 * main-thread fallback へ切り替える。callback は tracker snapshot と stats の publish に限定し、VRM
 * 適用や motion-debug recording は caller 側の責務に残す。
 */

import { createSincroGestureFallbackSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";
import type { SincroTrackerRoiStats } from "./sincroTrackerWorkerTypes";
import type { TrackerRuntimePredictionPlan } from "./trackerRuntimePredictionPlan";
import {
    collectTrackerRoiSkipReasons,
    publishTrackerSkippedHandSnapshot,
    resolveTrackerHandSkipReason,
} from "./trackerRuntimeRoiSnapshot";
import type { TrackerRuntimeRoiFrameInput } from "./trackerRuntimeStats";
import type { TrackerRuntimeCallbacks, TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

/**
 * 1 video frame を Worker へ送り、Face / Pose / Hand / ROI の結果を runtime callbacks へ publish する。
 *
 * frame loop が停止済み、または callbacks が解放済みの場合は推論結果を捨てて loop を stopped 扱いにする。
 * Hand が cadence / ROI pause / Pose stale により実行されなかった frame では lost/skip snapshot を publish
 * し、後段 reliability が「未実行」と「未検出」を区別できるようにする。失敗時の observable output は
 * `switchToMainThreadFallback(error)` であり、この関数は Worker 失敗を caller へ再 throw しない。
 */
export async function runTrackerRuntimeWorkerPipeline(input: {
    videoElement: HTMLVideoElement;
    callbacks?: TrackerRuntimeCallbacks;
    workerClient: SincroTrackerWorkerClient;
    timing: TrackerVideoFrameTiming;
    plan: TrackerRuntimePredictionPlan;
    handTrackingEnabled: boolean;
    gestureTrackingRequested: boolean;
    gestureTrackingEnabled: boolean;
    faceRoiTrackingEnabled: boolean;
    handRoiPaused: boolean;
    faceRoiPaused: boolean;
    frameLoopIsEnabled: () => boolean;
    markFrameLoopStopped: () => void;
    scheduleFrame: () => void;
    markPoseInference: (nowMs: number) => void;
    markHandInference: (nowMs: number) => void;
    markGestureInference: (nowMs: number) => void;
    markFaceRoiInference: (nowMs: number) => void;
    setLatestPoseSnapshot: (snapshot?: SincroPoseMotionSnapshot) => void;
    applyPosePerformanceGate: (
        snapshot: SincroPoseMotionSnapshot,
        nowMs: number,
        timing: TrackerVideoFrameTiming,
    ) => void;
    recordRoiFrame: (input: TrackerRuntimeRoiFrameInput) => SincroTrackerRoiStats;
    withBudget: (input: {
        stats: ReturnType<SincroTrackerWorkerClient["getStats"]>;
        poseInferenceTimeMs?: number;
        poseDetected?: boolean;
        roiStats: SincroTrackerRoiStats;
    }) => ReturnType<SincroTrackerWorkerClient["getStats"]>;
    switchToMainThreadFallback: (error: unknown) => Promise<void>;
}): Promise<void> {
    if (!input.frameLoopIsEnabled() || !input.callbacks) {
        input.markFrameLoopStopped();
        return;
    }
    markWorkerCadence(input);
    try {
        const transferStartedAtMs = performance.now();
        const frame = await createImageBitmap(input.videoElement);
        const transferTimeMs = performance.now() - transferStartedAtMs;
        const result = await input.workerClient.detect(
            frame,
            input.timing.mediaTimeMs,
            input.plan.runPose,
            input.plan.runHand,
            input.plan.runGesture,
            input.plan.runFaceRoi,
            transferTimeMs,
        );
        if (!input.frameLoopIsEnabled() || !input.callbacks) {
            input.markFrameLoopStopped();
            return;
        }
        input.callbacks.onFaceMotion(result.face, input.timing);
        if (result.pose) {
            input.setLatestPoseSnapshot(result.pose);
            input.callbacks.onPoseMotion?.(result.pose, input.timing);
            input.applyPosePerformanceGate(result.pose, input.timing.mediaTimeMs, input.timing);
        }
        if (result.hand) {
            input.callbacks.onHandMotion?.(result.hand, input.timing);
        } else if (!input.plan.runHand) {
            publishTrackerSkippedHandSnapshot({
                callbacks: input.callbacks,
                handTrackingEnabled: input.handTrackingEnabled,
                timing: input.timing,
                reason: resolveTrackerHandSkipReason(
                    input.plan.hasFreshPoseForOptionalPass,
                    input.handRoiPaused,
                ),
            });
        }
        if (result.gesture) {
            input.callbacks.onGestureMotion?.(result.gesture, input.timing);
        } else if (!input.plan.runGesture && input.plan.gestureSkipReason !== undefined) {
            publishSkippedGestureSnapshot(input, input.plan.gestureSkipReason);
        }
        const roiStats = input.recordRoiFrame({
            handRan: input.plan.runHand,
            faceRoiRan: input.plan.runFaceRoi,
            handResult:
                result.hand === undefined
                    ? undefined
                    : { snapshot: result.hand, inferenceTimeMs: result.hand.inferenceTimeMs },
            faceRoiSnapshot: result.faceRoi,
            skippedReasons: collectTrackerRoiSkipReasons({
                handTrackingEnabled: input.handTrackingEnabled,
                faceRoiTrackingEnabled: input.faceRoiTrackingEnabled,
                handPaused: input.handRoiPaused,
                faceRoiPaused: input.faceRoiPaused,
                runHand: input.plan.runHand,
                runFaceRoi: input.plan.runFaceRoi,
                hasFreshPoseSnapshot: input.plan.hasFreshPoseForOptionalPass,
            }),
        });
        input.callbacks.onTrackerStats?.(
            input.withBudget({
                stats: result.stats,
                poseInferenceTimeMs: result.pose?.inferenceTimeMs,
                poseDetected: result.pose?.detected,
                roiStats,
            }),
        );
        input.scheduleFrame();
    } catch (error) {
        // Worker detect / transfer failure は同期推論停止ではなく main-thread fallback の起点にする。
        await input.switchToMainThreadFallback(error);
    }
}

function markWorkerCadence(input: {
    timing: TrackerVideoFrameTiming;
    plan: TrackerRuntimePredictionPlan;
    markPoseInference: (nowMs: number) => void;
    markHandInference: (nowMs: number) => void;
    markGestureInference: (nowMs: number) => void;
    markFaceRoiInference: (nowMs: number) => void;
}): void {
    if (input.plan.runPose) {
        input.markPoseInference(input.timing.mediaTimeMs);
    }
    if (input.plan.runHand) {
        input.markHandInference(input.timing.mediaTimeMs);
    }
    if (input.plan.runGesture) {
        input.markGestureInference(input.timing.mediaTimeMs);
    }
    if (input.plan.runFaceRoi) {
        input.markFaceRoiInference(input.timing.mediaTimeMs);
    }
}

function publishSkippedGestureSnapshot(
    input: {
        callbacks?: TrackerRuntimeCallbacks;
        gestureTrackingRequested: boolean;
        gestureTrackingEnabled: boolean;
        timing: TrackerVideoFrameTiming;
    },
    reason: NonNullable<TrackerRuntimePredictionPlan["gestureSkipReason"]>,
): void {
    if (!input.gestureTrackingRequested) {
        return;
    }
    input.callbacks?.onGestureMotion?.(
        createSincroGestureFallbackSnapshot({
            reason,
            nowMs: input.timing.mediaTimeMs,
            trackingEnabled: input.gestureTrackingEnabled,
        }),
        input.timing,
    );
}
