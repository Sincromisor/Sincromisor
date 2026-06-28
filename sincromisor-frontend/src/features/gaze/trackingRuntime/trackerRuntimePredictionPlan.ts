import {
    shouldRunTrackerFaceRoiInference,
    shouldRunTrackerHandInference,
    shouldRunTrackerInference,
    shouldRunTrackerPoseInference,
} from "./trackerRuntimeCadence";

export type TrackerRuntimePredictionPlanInput = {
    nowMs: number;
    lastInferenceAtMs: number;
    lastPoseInferenceAtMs: number;
    lastHandInferenceAtMs: number;
    lastFaceRoiInferenceAtMs: number;
    targetInferenceFps: number;
    targetPoseInferenceFps: number;
    targetHandInferenceFps: number;
    targetFaceRoiInferenceFps: number;
    poseTrackingEnabled: boolean;
    handTrackingEnabled: boolean;
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
    runFaceRoi: boolean;
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

    return {
        runFace,
        runPose,
        hasFreshPoseForOptionalPass,
        runHand: shouldRunTrackerHandInference({
            handTrackingEnabled: input.handTrackingEnabled,
            poseDegradedToFaceOnly: input.poseDegradedToFaceOnly,
            handRoiPaused: input.handRoiPaused,
            lastHandInferenceAtMs: input.lastHandInferenceAtMs,
            targetHandInferenceFps: input.targetHandInferenceFps,
            hasFreshPoseSnapshot: hasFreshPoseForOptionalPass,
            nowMs: input.nowMs,
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
