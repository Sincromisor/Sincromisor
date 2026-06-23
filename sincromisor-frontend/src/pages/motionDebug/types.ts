import type {
    MotionDebugRecorderConfig,
    MotionDebugRecorderResult,
    MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";
import type {
    MotionMetricConfig,
    MotionMetricSummary,
} from "../../character/motionEvaluation/motionMetrics";
import type {
    MotionReplayFrameResult,
    MotionReplayLoadResult,
    MotionReplayMode,
    MotionReplayState,
} from "../../character/motionEvaluation/motionReplayPlayer";
import type { SincroPoseRetargetConfig } from "../../character/retargeting/sincroPoseRetargeter";
import type { DebugConsoleSnapshot } from "../../features/debug/model/debugConsoleManager";
import type {
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";

export type MotionDebugStatus = "idle" | "loading" | "running" | "stopped" | "error";

export type MotionDebugCameraState = {
    source: "none" | "camera" | "fixture";
    width: number;
    height: number;
    readyState: number;
};

export type MotionDebugRenderMetrics = {
    renderFps: number;
    lastFrameCapturedAtMs?: number;
};

export type MotionDebugSnapshot = {
    status: MotionDebugStatus;
    message: string;
    camera: MotionDebugCameraState;
    recording: MotionDebugRecorderState;
    pose: SincroPoseMotionSnapshot;
    tracker: SincroTrackerWorkerStats;
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    poseRetargetRuntime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];
    render: MotionDebugRenderMetrics;
};

export type MotionDebugRecordingDownloadResult =
    | {
          ok: true;
          fileName: string;
          mimeType: string;
          byteLength: number;
          state: MotionDebugRecorderState;
      }
    | {
          ok: false;
          code: "not_stopped" | "no_frames" | "export_failed";
          message: string;
          state: MotionDebugRecorderState;
      };

export type MotionDebugReplayFrameResult = MotionReplayFrameResult<MotionDebugSnapshot>;
export type MotionDebugReplayLoadResult = MotionReplayLoadResult<MotionDebugSnapshot>;
export type MotionDebugReplayState = MotionReplayState<MotionDebugSnapshot>;
export type MotionDebugReplayMetricsResult =
    | { ok: true; summary: MotionMetricSummary }
    | { ok: false; code: "no_recording_loaded"; message: string };

export type MotionDebugApi = {
    startCamera: () => Promise<MotionDebugSnapshot>;
    stopCamera: () => void;
    setRetargetConfig: (config: Partial<SincroPoseRetargetConfig>) => MotionDebugSnapshot;
    getSnapshot: () => MotionDebugSnapshot;
    captureFrame: () => string;
    waitForPoseDetected: (timeoutMs?: number) => Promise<MotionDebugSnapshot>;
    loadVideoFixture: (url: string) => Promise<MotionDebugSnapshot>;
    startRecording: (config?: Partial<MotionDebugRecorderConfig>) => MotionDebugRecorderResult;
    stopRecording: () => MotionDebugRecorderResult;
    downloadRecording: (options?: {
        compression?: MotionDebugRecorderConfig["compression"];
    }) => Promise<MotionDebugRecordingDownloadResult>;
    getRecordingState: () => MotionDebugRecorderState;
    loadRecording: (fileOrText: File | string) => Promise<MotionDebugReplayLoadResult>;
    startReplay: (options: {
        mode: MotionReplayMode;
        autoplay?: boolean;
    }) => MotionDebugReplayFrameResult;
    stepReplay: (frameIndex: number) => MotionDebugReplayFrameResult;
    stopReplay: () => MotionDebugReplayState;
    getReplayState: () => MotionDebugReplayState;
    calculateReplayMetrics: (config: MotionMetricConfig) => MotionDebugReplayMetricsResult;
};

declare global {
    interface Window {
        __SINCRO_MOTION_DEBUG__?: MotionDebugApi;
    }
}

export type MotionDebugRetargetUiConfig = Pick<
    SincroPoseRetargetConfig,
    "armIkMode" | "armIkStrength" | "armIkTargetScale" | "smoothingMs" | "minConfidence"
>;

export type MotionDebugPoseTarget = {
    name: string;
    point: SincroPoseTargetPointSnapshot;
};
