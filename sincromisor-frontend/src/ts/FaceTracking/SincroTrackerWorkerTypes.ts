import type { SincroFaceMotionSnapshot } from "./SincroFaceMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "./SincroPoseMotionSnapshot";

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
    loadTimeMs: number;
    droppedFrames: number;
    fallbackReason: string | null;
};

export type SincroTrackerWorkerInitMessage = {
    type: "init";
    poseEnabled: boolean;
};

export type SincroTrackerWorkerDetectMessage = {
    type: "detect";
    requestId: number;
    frame: ImageBitmap;
    timestampMs: number;
    poseEnabled: boolean;
};

export type SincroTrackerWorkerStopMessage = {
    type: "stop";
    reason: string | null;
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
    pose: SincroPoseMotionSnapshot | null;
    workerTimeMs: number;
};

export type SincroTrackerWorkerStoppedMessage = {
    type: "stopped";
    face: SincroFaceMotionSnapshot;
    pose: SincroPoseMotionSnapshot;
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
