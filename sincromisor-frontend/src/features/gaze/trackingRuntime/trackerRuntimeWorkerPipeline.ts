/**
 * ImageBitmap transfer を使って Worker detect を呼び、Worker failure を fallback 起点へ変換する pipeline。
 * transfer / close の lifecycle をここで閉じ、snapshot 適用や VRM 更新は callback 先の責務に残す。
 */
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

export async function runTrackerRuntimeWorkerPipeline(input: {
    videoElement: HTMLVideoElement;
    callbacks?: TrackerRuntimeCallbacks;
    workerClient: SincroTrackerWorkerClient;
    timing: TrackerVideoFrameTiming;
    plan: TrackerRuntimePredictionPlan;
    handTrackingEnabled: boolean;
    faceRoiTrackingEnabled: boolean;
    handRoiPaused: boolean;
    faceRoiPaused: boolean;
    frameLoopIsEnabled: () => boolean;
    markFrameLoopStopped: () => void;
    scheduleFrame: () => void;
    markPoseInference: (nowMs: number) => void;
    markHandInference: (nowMs: number) => void;
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
    markFaceRoiInference: (nowMs: number) => void;
}): void {
    if (input.plan.runPose) {
        input.markPoseInference(input.timing.mediaTimeMs);
    }
    if (input.plan.runHand) {
        input.markHandInference(input.timing.mediaTimeMs);
    }
    if (input.plan.runFaceRoi) {
        input.markFaceRoiInference(input.timing.mediaTimeMs);
    }
}
