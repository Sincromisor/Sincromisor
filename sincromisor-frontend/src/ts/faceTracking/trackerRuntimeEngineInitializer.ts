import { frontendLogger } from "../logging/appLogger";
import type { SincroFaceTracker } from "./sincroFaceTracker";
import type { SincroPoseTracker } from "./sincroPoseTracker";
import { SincroTrackerWorkerClient } from "./sincroTrackerWorkerClient";

type TrackerRuntimeEngineInitializerOptions = {
    faceTracker: SincroFaceTracker;
    poseTracker: SincroPoseTracker;
    workerClient: SincroTrackerWorkerClient;
    poseTrackingEnabled: boolean;
    preferWorker: boolean;
    onWorkerFallback: (reason: string) => void;
    onPoseInitializationFallback: (reason: string, nowMs: number) => void;
};

export async function initializeTrackerRuntimeEngine(
    options: TrackerRuntimeEngineInitializerOptions,
): Promise<boolean> {
    if (options.preferWorker && SincroTrackerWorkerClient.isSupported()) {
        try {
            await options.workerClient.init(options.poseTrackingEnabled);
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
}

export function formatTrackerRuntimeErrorDetail(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
