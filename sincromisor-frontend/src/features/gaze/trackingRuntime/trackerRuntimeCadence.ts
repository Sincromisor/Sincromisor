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

type TrackerHandInferenceCadenceOptions = {
    handTrackingEnabled: boolean;
    poseDegradedToFaceOnly: boolean;
    lastHandInferenceAtMs: number;
    targetHandInferenceFps: number;
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

export function shouldRunTrackerHandInference(
    options: TrackerHandInferenceCadenceOptions,
): boolean {
    if (options.handTrackingEnabled === false || options.poseDegradedToFaceOnly) {
        return false;
    }
    if (options.lastHandInferenceAtMs < 0) {
        return true;
    }
    return options.nowMs - options.lastHandInferenceAtMs >= 1000 / options.targetHandInferenceFps;
}
