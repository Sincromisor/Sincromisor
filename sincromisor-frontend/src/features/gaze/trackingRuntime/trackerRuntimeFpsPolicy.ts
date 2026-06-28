/**
 * main-thread fallback 時の Face / Pose / Hand / Face ROI target fps clamp を定義する。
 * UI フリーズを避けるための safety limit であり、値を変える場合は tracking design の fallback fps と performance budget tests を確認する。
 */
export type TrackerRuntimeFpsTargets = {
    targetInferenceFps: number;
    targetPoseInferenceFps: number;
    targetHandInferenceFps: number;
    targetFaceRoiInferenceFps: number;
};

const MAIN_THREAD_FALLBACK_FACE_FPS_LIMIT = 8;
const MAIN_THREAD_FALLBACK_POSE_FPS_LIMIT = 4;
const MAIN_THREAD_FALLBACK_HAND_FPS_LIMIT = 2;
const MAIN_THREAD_FALLBACK_FACE_ROI_FPS_LIMIT = 3;

export function clampTrackerRuntimeTargetsForMainThreadFallback(
    targets: TrackerRuntimeFpsTargets,
): TrackerRuntimeFpsTargets {
    return {
        targetInferenceFps: Math.min(
            targets.targetInferenceFps,
            MAIN_THREAD_FALLBACK_FACE_FPS_LIMIT,
        ),
        targetPoseInferenceFps: Math.min(
            targets.targetPoseInferenceFps,
            MAIN_THREAD_FALLBACK_POSE_FPS_LIMIT,
        ),
        targetHandInferenceFps: Math.min(
            targets.targetHandInferenceFps,
            MAIN_THREAD_FALLBACK_HAND_FPS_LIMIT,
        ),
        targetFaceRoiInferenceFps: Math.min(
            targets.targetFaceRoiInferenceFps,
            MAIN_THREAD_FALLBACK_FACE_ROI_FPS_LIMIT,
        ),
    };
}
