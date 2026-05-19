type TrackerInferenceCadenceOptions = {
    lastInferenceAtMs: number;
    targetInferenceFps: number;
    nowMs: number;
};

type TrackerPoseInferenceCadenceOptions = {
    poseTrackingEnabled: boolean;
    poseDegradedToFaceOnly: boolean;
    lastPoseInferenceAtMs: number;
    targetPoseInferenceFps: number;
    nowMs: number;
};

export function shouldRunTrackerInference(options: TrackerInferenceCadenceOptions): boolean {
    if (options.lastInferenceAtMs < 0) {
        return true;
    }
    return options.nowMs - options.lastInferenceAtMs >= 1000 / options.targetInferenceFps;
}

export function shouldRunTrackerPoseInference(
    options: TrackerPoseInferenceCadenceOptions,
): boolean {
    if (options.poseTrackingEnabled === false || options.poseDegradedToFaceOnly) {
        return false;
    }
    if (options.lastPoseInferenceAtMs < 0) {
        return true;
    }
    return options.nowMs - options.lastPoseInferenceAtMs >= 1000 / options.targetPoseInferenceFps;
}
