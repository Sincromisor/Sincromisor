/**
 * TrackerRuntime の callback、cadence 既定値、video frame timing、mutable state contract を定義する。
 * 時刻は mediaTimeMs / performanceMs を区別し、rVFC 非対応環境では欠損 field を undefined のまま保持する。
 */
import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroGestureMotionSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { TrackerRuntimeMediaPipeRawResult } from "./mediaPipeRawResultSerializer";
import type { SincroTrackerWorkerStats } from "./sincroTrackerWorkerTypes";
import type {
    TrackerPerformanceReasonCode,
    TrackerRuntimeDegradationState,
} from "./trackerRuntimePerformanceBudget";
import type {
    TrackerRuntimePerformanceProfile,
    TrackerRuntimePerformanceProfileId,
} from "./trackerRuntimePerformanceProfile";

export const DEFAULT_TARGET_INFERENCE_FPS = 15;
export const DEFAULT_TARGET_POSE_INFERENCE_FPS = 12;
export const DEFAULT_TARGET_HAND_INFERENCE_FPS = 4;
export const DEFAULT_TARGET_FACE_ROI_INFERENCE_FPS = 6;
export const DEFAULT_TARGET_GESTURE_INFERENCE_FPS = 3;

export type TrackerVideoFrameClockSource =
    | "request-video-frame-callback"
    | "request-animation-frame"
    | "timer";

export type TrackerVideoFrameTiming = {
    source: TrackerVideoFrameClockSource;
    receivedAtPerformanceMs: number;
    mediaTimeMs: number;
    videoCurrentTimeMs: number;
    presentationTimeMs?: number;
    expectedDisplayTimeMs?: number;
    presentedFrames?: number;
    droppedPresentedFrames: number;
};

export type TrackerRuntimeCallbacks = {
    onFaceMotion: (snapshot: SincroFaceMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onGestureMotion?: (
        snapshot: SincroGestureMotionSnapshot,
        timing?: TrackerVideoFrameTiming,
    ) => void;
    onHandMotion?: (snapshot: SincroHandMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onPoseMotion?: (snapshot: SincroPoseMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onPoseFallback?: (snapshot: SincroPoseMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onMediaPipeRawResult?: (
        result: TrackerRuntimeMediaPipeRawResult,
        timing?: TrackerVideoFrameTiming,
    ) => void;
    onTrackerStats?: (snapshot: SincroTrackerWorkerStats) => void;
    onError?: (error: unknown) => void;
};

export type TrackerRuntimePoseOptions = {
    enabled?: boolean;
    targetInferenceFps?: number;
    ignorePerformanceFallback?: boolean;
    performanceProfileId?: TrackerRuntimePerformanceProfileId;
    performanceProfile?: TrackerRuntimePerformanceProfile;
    hand?: {
        enabled?: boolean;
        targetInferenceFps?: number;
    };
    gesture?: {
        enabled?: boolean;
        targetInferenceFps?: number;
    };
    faceRoi?: {
        enabled?: boolean;
        targetInferenceFps?: number;
    };
};

export type TrackerRuntimeMutableState = {
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
    baseTargetInferenceFps: number;
    baseTargetPoseInferenceFps: number;
    baseTargetHandInferenceFps: number;
    baseTargetGestureInferenceFps: number;
    baseTargetFaceRoiInferenceFps: number;
    latestPoseSnapshot?: SincroPoseMotionSnapshot;
    poseTrackingEnabled: boolean;
    handTrackingEnabled: boolean;
    gestureTrackingRequested: boolean;
    gestureTrackingEnabled: boolean;
    faceRoiTrackingEnabled: boolean;
    poseDegradedToFaceOnly: boolean;
    useWorkerTracking: boolean;
    switchingToMainThreadFallback: boolean;
    degradationState: TrackerRuntimeDegradationState;
    degradationReason?: TrackerPerformanceReasonCode;
    degradationSinceMediaTimeMs?: number;
    mainThreadFallbackReason?: string;
    ignorePosePerformanceFallback: boolean;
    comfortableIdleActive: boolean;
};

export function createTrackerRuntimeMutableState(): TrackerRuntimeMutableState {
    return {
        lastInferenceAtMs: -1,
        lastPoseInferenceAtMs: -1,
        lastHandInferenceAtMs: -1,
        lastGestureInferenceAtMs: -1,
        lastFaceRoiInferenceAtMs: -1,
        targetInferenceFps: DEFAULT_TARGET_INFERENCE_FPS,
        targetPoseInferenceFps: DEFAULT_TARGET_POSE_INFERENCE_FPS,
        targetHandInferenceFps: DEFAULT_TARGET_HAND_INFERENCE_FPS,
        targetGestureInferenceFps: DEFAULT_TARGET_GESTURE_INFERENCE_FPS,
        targetFaceRoiInferenceFps: DEFAULT_TARGET_FACE_ROI_INFERENCE_FPS,
        baseTargetInferenceFps: DEFAULT_TARGET_INFERENCE_FPS,
        baseTargetPoseInferenceFps: DEFAULT_TARGET_POSE_INFERENCE_FPS,
        baseTargetHandInferenceFps: DEFAULT_TARGET_HAND_INFERENCE_FPS,
        baseTargetGestureInferenceFps: DEFAULT_TARGET_GESTURE_INFERENCE_FPS,
        baseTargetFaceRoiInferenceFps: DEFAULT_TARGET_FACE_ROI_INFERENCE_FPS,
        poseTrackingEnabled: false,
        handTrackingEnabled: false,
        gestureTrackingRequested: false,
        gestureTrackingEnabled: false,
        faceRoiTrackingEnabled: false,
        poseDegradedToFaceOnly: false,
        useWorkerTracking: false,
        switchingToMainThreadFallback: false,
        degradationState: "full",
        ignorePosePerformanceFallback: false,
        comfortableIdleActive: false,
    };
}
