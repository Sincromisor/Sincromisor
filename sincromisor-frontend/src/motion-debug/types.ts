import type {
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../ts/faceTracking/sincroPoseMotionSnapshot";
import type { SincroTrackerWorkerStats } from "../ts/faceTracking/sincroTrackerWorkerTypes";
import type { SincroPoseRetargetConfig } from "../ts/sincroVrm/vrmCharacter/sincroPoseRetargeter";
import type { DebugConsoleSnapshot } from "../ts/ui/debugConsoleManager";

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
    pose: SincroPoseMotionSnapshot;
    tracker: SincroTrackerWorkerStats;
    poseRetarget: DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
    poseRetargetRuntime: DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];
    render: MotionDebugRenderMetrics;
};

export type MotionDebugApi = {
    startCamera: () => Promise<MotionDebugSnapshot>;
    stopCamera: () => void;
    setRetargetConfig: (config: Partial<SincroPoseRetargetConfig>) => MotionDebugSnapshot;
    getSnapshot: () => MotionDebugSnapshot;
    captureFrame: () => string;
    waitForPoseDetected: (timeoutMs?: number) => Promise<MotionDebugSnapshot>;
    loadVideoFixture: (url: string) => Promise<MotionDebugSnapshot>;
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
