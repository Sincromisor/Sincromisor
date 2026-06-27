import { frontendLogger } from "../../../shared/logging/appLogger";
import type { SincroFaceTracker } from "../faceTracking/sincroFaceTracker";
import type { SincroHandTracker } from "../handTracking/sincroHandTracker";
import type { SincroPoseTracker } from "../poseTracking/sincroPoseTracker";
import { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";

type TrackerRuntimeEngineInitializerOptions = {
    faceTracker: SincroFaceTracker;
    poseTracker: SincroPoseTracker;
    handTracker: SincroHandTracker;
    workerClient: SincroTrackerWorkerClient;
    poseTrackingEnabled: boolean;
    handTrackingEnabled: boolean;
    preferWorker: boolean;
    onWorkerFallback: (reason: string) => void;
    onPoseInitializationFallback: (reason: string, nowMs: number) => void;
};

export async function initializeTrackerRuntimeEngine(
    options: TrackerRuntimeEngineInitializerOptions,
): Promise<boolean> {
    if (options.preferWorker && SincroTrackerWorkerClient.isSupported()) {
        try {
            await options.workerClient.init(
                options.poseTrackingEnabled,
                options.handTrackingEnabled,
            );
            return true;
        } catch (error) {
            frontendLogger.warn(
                "Sincro tracker worker initialization failed. Falling back to main-thread tracking.",
                { error },
            );
            options.onWorkerFallback(formatTrackerRuntimeErrorDetail(error));
        }
    } else if (options.preferWorker) {
        options.onWorkerFallback("worker_or_createImageBitmap_unavailable");
    }
    await initializeMainThreadTrackers(options);
    return false;
}

async function initializeMainThreadTrackers(
    options: TrackerRuntimeEngineInitializerOptions,
): Promise<void> {
    await options.faceTracker.initVision();
    if (!options.poseTrackingEnabled) {
        return;
    }
    try {
        await options.poseTracker.initVision();
    } catch (error) {
        frontendLogger.warn(
            "Sincro PoseLandmarker initialization failed. Continuing with face-only tracking.",
            { error },
        );
        options.onPoseInitializationFallback(
            formatTrackerRuntimeErrorDetail(error),
            performance.now(),
        );
    }
    if (!options.handTrackingEnabled) {
        return;
    }
    try {
        await options.handTracker.initVision();
    } catch (error) {
        frontendLogger.warn(
            "Sincro HandLandmarker initialization failed. Continuing without hand tracking.",
            { error },
        );
    }
}

export function formatTrackerRuntimeErrorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
