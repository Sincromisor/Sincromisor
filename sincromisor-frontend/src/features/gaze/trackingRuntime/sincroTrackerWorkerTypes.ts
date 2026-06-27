import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import type { SincroHandMotionSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { TrackerPerformanceBudgetReport } from "./trackerRuntimePerformanceBudget";

export type SincroTrackerWorkerStatus =
    | "idle"
    | "loading"
    | "ready"
    | "running"
    | "fallback"
    | "unavailable";

export type SincroTrackerRuntimeMode = "worker" | "main-thread" | "fallback";

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
    loadTimeMs: number;
    droppedFrames: number;
    fallbackReason?: string;
    budget?: TrackerPerformanceBudgetReport;
};

export type SincroTrackerWorkerInitMessage = {
    type: "init";
    poseEnabled: boolean;
    handEnabled: boolean;
};

export type SincroTrackerWorkerDetectMessage = {
    type: "detect";
    requestId: number;
    frame: ImageBitmap;
    timestampMs: number;
    poseEnabled: boolean;
    handEnabled: boolean;
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
    pose?: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
    workerTimeMs: number;
};

export type SincroTrackerWorkerStoppedMessage = {
    type: "stopped";
    face: SincroFaceMotionSnapshot;
    pose: SincroPoseMotionSnapshot;
    hand: SincroHandMotionSnapshot;
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
