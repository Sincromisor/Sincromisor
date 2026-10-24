/**
 * 映像フレームをImageBitmapでWorkerへ転送し、推論結果と転送時間を呼出元へ返す。
 * 推論・転送障害はメインスレッドへ切り替え、利用者による中断はそのまま完了する。
 * VRMへの適用と診断記録は呼出元の責務に残す。
 */

import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";
import type { SincroTrackerRoiStats } from "./sincroTrackerWorkerTypes";
import type { TrackerRuntimePredictionPlan } from "./trackerRuntimePredictionPlan";
import {
    collectTrackerRoiSkipReasons,
    publishTrackerSkippedGestureSnapshot,
    publishTrackerSkippedHandSnapshot,
    resolveTrackerHandSkipReason,
} from "./trackerRuntimeRoiSnapshot";
import type { TrackerRuntimeRoiFrameInput } from "./trackerRuntimeStats";
import type { TrackerRuntimeCallbacks, TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

/**
 * 一つの映像フレームを推論し、顔・姿勢・手・注目領域の結果をコールバックへ通知する。
 * 停止済みなら結果を破棄し、頻度制御や姿勢の古さで手を処理しない場合は未実行の結果を通知する。
 * 利用者の中断は通知せず完了する。それ以外の障害は代替追跡へ渡し、呼出元へ再throwしない。
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
        // 転送準備中に終了した旧フレームは、現在のWorkerへ送らずここで解放する。
        if (!input.frameLoopIsEnabled()) {
            frame.close();
            input.markFrameLoopStopped();
            return;
        }
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
        if (result.mediapipe !== undefined) {
            input.callbacks.onMediaPipeRawResult?.(result.mediapipe, input.timing);
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
            publishTrackerSkippedGestureSnapshot(input, input.plan.gestureSkipReason);
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
        // 体験終了で拒否された推論は、代替エンジンを起動せず完了させる。
        if (!input.frameLoopIsEnabled()) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Workerの推論・転送障害時は、メインスレッドでの追跡へ切り替える。
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
