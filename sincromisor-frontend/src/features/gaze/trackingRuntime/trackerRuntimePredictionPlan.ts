/**
 * frame ごとの Face / Pose / Hand / Face ROI 実行計画を作る純粋 helper。
 * cadence、policy stage、ROI pause、pose stale を合成するだけで、MediaPipe 実行や callback publish は行わない。
 */
import {
    shouldRunTrackerFaceRoiInference,
    shouldRunTrackerGestureInference,
    shouldRunTrackerHandInference,
    shouldRunTrackerInference,
    shouldRunTrackerPoseInference,
} from "./trackerRuntimeCadence";

export type TrackerRuntimePredictionPlanInput = {
    nowMs: number;
    lastInferenceAtMs: number;
    lastPoseInferenceAtMs: number;
    lastHandInferenceAtMs: number;
    lastGestureInferenceAtMs: number;
    lastFaceRoiInferenceAtMs: number;
    targetInferenceFps: number;
    targetPoseInferenceFps: number;
    targetHandInferenceFps: number;
    targetGestureInferenceFps: number;
    targetFaceRoiInferenceFps: number;
    poseTrackingEnabled: boolean;
    handTrackingEnabled: boolean;
    gestureTrackingRequested: boolean;
    gestureTrackingEnabled: boolean;
    faceRoiTrackingEnabled: boolean;
    poseDegradedToFaceOnly: boolean;
    poseRecoveryProbeActive: boolean;
    handRoiPaused: boolean;
    faceRoiPaused: boolean;
    latestPoseSnapshotIsFresh: boolean;
};

export type TrackerRuntimePredictionPlan = {
    runFace: boolean;
    runPose: boolean;
    hasFreshPoseForOptionalPass: boolean;
    runHand: boolean;
    runGesture: boolean;
    runFaceRoi: boolean;
    gestureSkipReason?:
        | "gesture_requires_pose_and_hand"
        | "gesture_pose_unavailable"
        | "gesture_hand_paused"
        | "gesture_pose_stopped";
};

export function createTrackerRuntimePredictionPlan(
    input: TrackerRuntimePredictionPlanInput,
): TrackerRuntimePredictionPlan {
    const runFace = shouldRunTrackerInference({
        lastInferenceAtMs: input.lastInferenceAtMs,
        targetInferenceFps: input.targetInferenceFps,
        nowMs: input.nowMs,
    });
    const poseDegradedToFaceOnly = input.poseDegradedToFaceOnly && !input.poseRecoveryProbeActive;
    const runPose = shouldRunTrackerPoseInference({
        poseTrackingEnabled: input.poseTrackingEnabled,
        poseDegradedToFaceOnly,
        lastPoseInferenceAtMs: input.lastPoseInferenceAtMs,
        targetPoseInferenceFps: input.targetPoseInferenceFps,
        nowMs: input.nowMs,
    });
    const hasFreshPoseForOptionalPass = runPose || input.latestPoseSnapshotIsFresh;

    const runHand = shouldRunTrackerHandInference({
        handTrackingEnabled: input.handTrackingEnabled,
        poseDegradedToFaceOnly: input.poseDegradedToFaceOnly,
        handRoiPaused: input.handRoiPaused,
        lastHandInferenceAtMs: input.lastHandInferenceAtMs,
        targetHandInferenceFps: input.targetHandInferenceFps,
        hasFreshPoseSnapshot: hasFreshPoseForOptionalPass,
        nowMs: input.nowMs,
    });
    return {
        runFace,
        runPose,
        hasFreshPoseForOptionalPass,
        runHand,
        runGesture: shouldRunTrackerGestureInference({
            gestureTrackingEnabled: input.gestureTrackingEnabled,
            poseDegradedToFaceOnly: input.poseDegradedToFaceOnly,
            handRoiPaused: input.handRoiPaused,
            handRan: runHand,
            lastGestureInferenceAtMs: input.lastGestureInferenceAtMs,
            targetGestureInferenceFps: input.targetGestureInferenceFps,
            hasFreshPoseSnapshot: hasFreshPoseForOptionalPass,
            nowMs: input.nowMs,
        }),
        gestureSkipReason: resolveGestureSkipReason({
            requested: input.gestureTrackingRequested,
            enabled: input.gestureTrackingEnabled,
            poseDegradedToFaceOnly: input.poseDegradedToFaceOnly,
            handRoiPaused: input.handRoiPaused,
            hasFreshPoseSnapshot: hasFreshPoseForOptionalPass,
            runHand,
        }),
        runFaceRoi: shouldRunTrackerFaceRoiInference({
            faceRoiTrackingEnabled: input.faceRoiTrackingEnabled,
            poseDegradedToFaceOnly: input.poseDegradedToFaceOnly,
            faceRoiPaused: input.faceRoiPaused,
            lastFaceRoiInferenceAtMs: input.lastFaceRoiInferenceAtMs,
            targetFaceRoiInferenceFps: input.targetFaceRoiInferenceFps,
            hasFreshPoseSnapshot: hasFreshPoseForOptionalPass,
            nowMs: input.nowMs,
        }),
    };
}

function resolveGestureSkipReason(input: {
    requested: boolean;
    enabled: boolean;
    poseDegradedToFaceOnly: boolean;
    handRoiPaused: boolean;
    hasFreshPoseSnapshot: boolean;
    runHand: boolean;
}): TrackerRuntimePredictionPlan["gestureSkipReason"] {
    if (!input.requested) {
        return undefined;
    }
    if (!input.enabled) {
        return "gesture_requires_pose_and_hand";
    }
    if (input.poseDegradedToFaceOnly) {
        return "gesture_pose_stopped";
    }
    if (input.handRoiPaused) {
        return "gesture_hand_paused";
    }
    if (!input.hasFreshPoseSnapshot) {
        return "gesture_pose_unavailable";
    }
    return undefined;
}
