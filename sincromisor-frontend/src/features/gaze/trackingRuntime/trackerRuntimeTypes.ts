import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "./sincroTrackerWorkerTypes";

export const DEFAULT_TARGET_INFERENCE_FPS = 15;
export const DEFAULT_TARGET_POSE_INFERENCE_FPS = 12;
export const DEFAULT_TARGET_HAND_INFERENCE_FPS = 4;
export const DEFAULT_TARGET_FACE_ROI_INFERENCE_FPS = 6;

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
    onHandMotion?: (snapshot: SincroHandMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onPoseMotion?: (snapshot: SincroPoseMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onPoseFallback?: (snapshot: SincroPoseMotionSnapshot, timing?: TrackerVideoFrameTiming) => void;
    onTrackerStats?: (snapshot: SincroTrackerWorkerStats) => void;
    onError?: (error: unknown) => void;
};

export type TrackerRuntimePoseOptions = {
    enabled?: boolean;
    targetInferenceFps?: number;
    ignorePerformanceFallback?: boolean;
    hand?: {
        enabled?: boolean;
        targetInferenceFps?: number;
    };
    faceRoi?: {
        enabled?: boolean;
        targetInferenceFps?: number;
    };
};
