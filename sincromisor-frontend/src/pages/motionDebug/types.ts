import type {
    CanonicalUpperBodyState,
    CanonicalUpperBodyStateParseError,
} from "../../character/canonical/canonicalUpperBodyState";
import type {
    MotionDebugFinalPoseParseResult,
    MotionDebugFinalPoseSnapshot,
    MotionDebugPhase6SolverParseResult,
    MotionDebugPhase6SolverSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase6Snapshot";
import type {
    MotionDebugPhase7Snapshot,
    MotionDebugPhase7SnapshotParseResult,
} from "../../character/motionEvaluation/motionDebugPhase7Snapshot";
import type {
    MotionDebugRecorderConfig,
    MotionDebugRecorderResult,
    MotionDebugRecorderState,
} from "../../character/motionEvaluation/motionDebugRecorder";
import type {
    MotionMetricComparison,
    MotionMetricConfig,
    MotionMetricKey,
    MotionMetricSummary,
} from "../../character/motionEvaluation/motionMetrics";
import type {
    MotionReplayFrameResult,
    MotionReplayLoadResult,
    MotionReplayMode,
    MotionReplayState,
} from "../../character/motionEvaluation/motionReplayPlayer";
import type {
    ReliabilityMap,
    ReliabilityMapParseResult,
} from "../../character/reliability/reliabilityMap";
import type { SincroPoseRetargetConfig } from "../../character/retargeting/sincroPoseRetargeter";
import type {
    TemporalUpperBodyState,
    TemporalUpperBodyStateParseResult,
} from "../../character/temporal/temporalUpperBodyState";
import type { DebugConsoleSnapshot } from "../../features/debug/model/debugConsoleManager";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type {
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { SincroTrackerWorkerStats } from "../../features/gaze/trackingRuntime/sincroTrackerWorkerTypes";
import type { TrackerVideoFrameTiming } from "../../features/gaze/trackingRuntime/trackerRuntimeTypes";

export type MotionDebugStatus = "idle" | "loading" | "running" | "stopped" | "error";

export type MotionDebugCameraState = {
    source: "none" | "camera" | "fixture";
    width: number;
    height: number;
    readyState: number;
    frameTiming?: TrackerVideoFrameTiming;
    quality?: CameraQualityScore;
};

export type MotionDebugRenderMetrics = {
    renderFps: number;
    lastFrameCapturedAtMs?: number;
};

export type CanonicalLayerParseError = {
    parseStatus: "invalid";
    errors: CanonicalUpperBodyStateParseError[];
    raw: unknown;
};

export type ReliabilityLayerParseError = {
    parseStatus: "invalid";
    errors: Extract<ReliabilityMapParseResult, { ok: false }>["errors"];
    raw: unknown;
};

export type TemporalLayerParseError = {
    parseStatus: "invalid";
    errors: Extract<TemporalUpperBodyStateParseResult, { ok: false }>["errors"];
    raw: unknown;
};

export type SolverLayerParseError = {
    parseStatus: "invalid";
    errors:
        | Extract<MotionDebugPhase6SolverParseResult, { ok: false }>["errors"]
        | Extract<MotionDebugPhase7SnapshotParseResult, { ok: false }>["errors"];
    raw: unknown;
};

export type SolverSubLayerValue =
    | { status: "available"; value: MotionDebugPhase6SolverSnapshot | MotionDebugPhase7Snapshot }
    | { status: "not_recorded" }
    | { status: "invalid"; value: SolverLayerParseError };

export type SolverLayerValue = {
    phase6: SolverSubLayerValue;
    phase7: SolverSubLayerValue;
};

export type FinalPoseLayerParseError = {
    parseStatus: "invalid";
    errors: Extract<MotionDebugFinalPoseParseResult, { ok: false }>["errors"];
    raw: unknown;
};

export type MotionDebugViewerMode = "live" | "recording" | "replay" | "metrics";

export type MotionDebugLayerKey =
    | "camera"
    | "mediapipe"
    | "poseSnapshot"
    | "reliability"
    | "canonical"
    | "temporal"
    | "intent"
    | "solver"
    | "finalPose"
    | "applied"
    | "metrics";

export type MotionDebugLayerStatus =
    | "available"
    | "not_recorded"
    | "not_implemented"
    | "not_calculated"
    | "invalid";

export type MotionDebugLayerSnapshot = {
    status: MotionDebugLayerStatus;
    label: string;
    value?: unknown;
};

export type MotionDebugViewerSnapshot = {
    mode: MotionDebugViewerMode;
    selectedLayer: MotionDebugLayerKey;
    layers: Record<MotionDebugLayerKey, MotionDebugLayerSnapshot>;
    recording?: Pick<
        MotionDebugRecorderState,
        "status" | "frameCount" | "durationMs" | "compression" | "compressionFallbackReason"
    > & {
        scrubbedCameraSettings?: boolean;
    };
    replay?: Pick<
        MotionReplayState,
        "status" | "mode" | "frameCount" | "currentFrameIndex" | "lastResult"
    >;
    metrics?: MotionMetricSummary;
    metricComparison?: Partial<Record<MotionMetricKey, MotionMetricComparison>>;
};

export type MotionDebugCanonicalReliabilityInput = {
    schemaVersion: ReliabilityMap["schemaVersion"];
    mediaTimeMs: number;
    leftArm: {
        partWeight: number;
        minJointWeight: number;
    };
    rightArm: {
        partWeight: number;
        minJointWeight: number;
    };
};

export type MotionDebugSnapshot = {
    status: MotionDebugStatus;
    message: string;
    camera: MotionDebugCameraState;
    recording: MotionDebugRecorderState;
    pose: SincroPoseMotionSnapshot;
    hand?: SincroHandMotionSnapshot;
    reliability?: ReliabilityMap | ReliabilityLayerParseError;
    canonical?: CanonicalUpperBodyState | CanonicalLayerParseError;
    temporal?: TemporalUpperBodyState | TemporalLayerParseError;
    canonicalReliabilityInput?: MotionDebugCanonicalReliabilityInput;
    tracker: SincroTrackerWorkerStats;
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    poseRetargetRuntime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];
    phase7?: MotionDebugPhase7Snapshot;
    finalPose?: MotionDebugFinalPoseSnapshot;
    render: MotionDebugRenderMetrics;
    viewer?: MotionDebugViewerSnapshot;
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
