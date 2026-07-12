/**
 * `window.__SINCRO_MOTION_DEBUG__` を install / replace する developer-only API 境界。
 * 公開 surface は MotionDebugApi 型を正本にし、runtime object や private controller を window へ直接漏らさない。
 */
import type {
    MotionDebugApi,
    MotionDebugReplayMetricsResult,
    MotionDebugSnapshot,
    MotionDebugStartCameraOptions,
} from "./types";

export type MotionDebugWindowApiController = MotionDebugApi;

export function installMotionDebugWindowApi(controller: MotionDebugWindowApiController): void {
    const api: MotionDebugApi = {
        startCamera: (options?: MotionDebugStartCameraOptions): Promise<MotionDebugSnapshot> =>
            controller.startCamera(options),
        stopCamera: () => {
            controller.stopCamera();
        },
        setRetargetConfig: (config) => controller.setRetargetConfig(config),
        getSnapshot: () => controller.getSnapshot(),
        captureFrame: () => controller.captureFrame(),
        waitForPoseDetected: (timeoutMs) => controller.waitForPoseDetected(timeoutMs),
        loadVideoFixture: (url) => controller.loadVideoFixture(url),
        startRecording: (config) => controller.startRecording(config),
        stopRecording: () => controller.stopRecording(),
        downloadRecording: (options) => controller.downloadRecording(options),
        getRecordingState: () => controller.getRecordingState(),
        loadRecording: (fileOrText) => controller.loadRecording(fileOrText),
        startReplay: (options) => controller.startReplay(options),
        stepReplay: (frameIndex) => controller.stepReplay(frameIndex),
        stopReplay: () => controller.stopReplay(),
        getReplayState: () => controller.getReplayState(),
        calculateReplayMetrics: (config): MotionDebugReplayMetricsResult =>
            controller.calculateReplayMetrics(config),
        runQaRegression: (config) => controller.runQaRegression(config),
        analyzeOptimizationCandidates: (config) => controller.analyzeOptimizationCandidates(config),
    };
    window.__SINCRO_MOTION_DEBUG__ = api;
}
