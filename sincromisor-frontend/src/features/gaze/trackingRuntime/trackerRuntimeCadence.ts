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
    handRoiPaused?: boolean;
    lastHandInferenceAtMs: number;
    targetHandInferenceFps: number;
    hasFreshPoseSnapshot?: boolean;
    nowMs: number;
};

type TrackerFaceRoiInferenceCadenceOptions = {
    faceRoiTrackingEnabled: boolean;
    poseDegradedToFaceOnly: boolean;
    faceRoiPaused?: boolean;
    lastFaceRoiInferenceAtMs: number;
    targetFaceRoiInferenceFps: number;
    hasFreshPoseSnapshot?: boolean;
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
    if (
        options.handTrackingEnabled === false ||
        options.poseDegradedToFaceOnly ||
        options.handRoiPaused === true ||
        options.hasFreshPoseSnapshot === false
    ) {
        return false;
    }
    if (options.lastHandInferenceAtMs < 0) {
        return true;
    }
    return options.nowMs - options.lastHandInferenceAtMs >= 1000 / options.targetHandInferenceFps;
}

export function shouldRunTrackerFaceRoiInference(
    options: TrackerFaceRoiInferenceCadenceOptions,
): boolean {
    if (
        options.faceRoiTrackingEnabled === false ||
        options.poseDegradedToFaceOnly ||
        options.faceRoiPaused === true ||
        options.hasFreshPoseSnapshot === false
    ) {
        return false;
    }
    if (options.lastFaceRoiInferenceAtMs < 0) {
        return true;
    }
    return (
        options.nowMs - options.lastFaceRoiInferenceAtMs >= 1000 / options.targetFaceRoiInferenceFps
    );
}
