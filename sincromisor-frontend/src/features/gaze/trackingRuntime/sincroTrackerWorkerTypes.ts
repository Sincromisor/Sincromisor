/**
 * Tracker Worker と main thread の postMessage contract を定義する。
 * ROI reason、degradation policy、budget report は debug / replay 観測用の plain object に限定し、MediaPipe raw result や transferable object を保存 contract に含めない。
 */
import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroGestureMotionSnapshot } from "../gestureTracking/sincroGestureMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { TrackerRuntimeDegradationPolicySnapshot } from "./trackerRuntimeDegradationPolicy";
import type { TrackerPerformanceBudgetReport } from "./trackerRuntimePerformanceBudget";

export type SincroTrackerWorkerStatus =
    | "idle"
    | "loading"
    | "ready"
    | "running"
    | "fallback"
    | "unavailable";

export type SincroTrackerRuntimeMode = "worker" | "main-thread" | "fallback";

export type SincroTrackerRoiReasonCode =
    | "hand_roi_skipped"
    | "face_roi_skipped"
    | "roi_fallback_full_frame"
    | "roi_inference_over_budget"
    | "pose_stale_for_roi"
    | "hand_roi_paused"
    | "face_roi_paused";

export type SincroTrackerRoiPauseState = "active" | "hand-paused" | "face-paused" | "all-paused";

export type SincroTrackerRoiStats = {
    pauseState: SincroTrackerRoiPauseState;
    fallbackCount: number;
    skippedFrames: number;
    consecutiveOverBudgetFrames: number;
    reasonCodes: SincroTrackerRoiReasonCode[];
};

export type SincroTrackerWorkerStats = {
    mode: SincroTrackerRuntimeMode;
    status: SincroTrackerWorkerStatus;
    transferTimeMs: number;
    workerRoundTripMs: number;
    workerTimeMs?: number;
    mainThreadDetectTimeMs?: number;
    effectiveFaceFps?: number;
    effectivePoseFps?: number;
    effectiveHandFps?: number;
    effectiveGestureFps?: number;
    effectiveFaceRoiFps?: number;
    loadTimeMs: number;
    droppedFrames: number;
    fallbackReason?: string;
    budget?: TrackerPerformanceBudgetReport;
    roi?: SincroTrackerRoiStats;
    degradationPolicy?: TrackerRuntimeDegradationPolicySnapshot;
};

export type SincroTrackerWorkerInitMessage = {
    type: "init";
    poseEnabled: boolean;
    handEnabled: boolean;
    gestureEnabled: boolean;
    faceRoiEnabled: boolean;
};

export type SincroTrackerWorkerDetectMessage = {
    type: "detect";
    requestId: number;
    frame: ImageBitmap;
    timestampMs: number;
    poseEnabled: boolean;
    handEnabled: boolean;
    gestureEnabled: boolean;
    faceRoiEnabled: boolean;
};

export type SincroTrackerWorkerStopMessage = {
    type: "stop";
    reason?: string;
    nowMs: number;
};

export type SincroTrackerWorkerDisposeMessage = {
    type: "dispose";
};

export type SincroTrackerWorkerInputMessage =
    | SincroTrackerWorkerInitMessage
    | SincroTrackerWorkerDetectMessage
    | SincroTrackerWorkerStopMessage
    | SincroTrackerWorkerDisposeMessage;

export type SincroTrackerWorkerStatusMessage = {
    type: "status";
    status: SincroTrackerWorkerStatus;
    message?: string;
    loadTimeMs?: number;
};

export type SincroTrackerWorkerResultMessage = {
    type: "result";
    requestId: number;
    face: SincroFaceMotionSnapshot;
    faceRoi?: SincroFaceMotionSnapshot;
    pose?: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
    gesture?: SincroGestureMotionSnapshot;
    workerTimeMs: number;
};

export type SincroTrackerWorkerStoppedMessage = {
    type: "stopped";
    face: SincroFaceMotionSnapshot;
    pose: SincroPoseMotionSnapshot;
    hand: SincroHandMotionSnapshot;
    gesture: SincroGestureMotionSnapshot;
};

export type SincroTrackerWorkerErrorMessage = {
    type: "error";
    requestId?: number;
    message: string;
};

export type SincroTrackerWorkerOutputMessage =
    | SincroTrackerWorkerStatusMessage
    | SincroTrackerWorkerResultMessage
    | SincroTrackerWorkerStoppedMessage
    | SincroTrackerWorkerErrorMessage;
