import type { SincroFaceMotionSnapshot } from "./SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "./SincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "./SincroTrackerWorkerTypes";

export const DEFAULT_TARGET_INFERENCE_FPS = 15;
export const DEFAULT_TARGET_POSE_INFERENCE_FPS = 12;

export type TrackerRuntimeCallbacks = {
    onFaceMotion: (snapshot: SincroFaceMotionSnapshot) => void;
    onPoseMotion?: (snapshot: SincroPoseMotionSnapshot) => void;
    onPoseFallback?: (snapshot: SincroPoseMotionSnapshot) => void;
    onTrackerStats?: (snapshot: SincroTrackerWorkerStats) => void;
    onError?: (error: unknown) => void;
};

export type TrackerRuntimePoseOptions = {
    enabled?: boolean;
    targetInferenceFps?: number;
    ignorePerformanceFallback?: boolean;
};
