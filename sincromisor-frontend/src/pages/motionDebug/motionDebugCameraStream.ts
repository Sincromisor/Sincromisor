/**
 * motion-debug 用 getUserMedia constraints と camera stream request の境界。
 * device id / label は保存 contract に持ち込まず、ideal constraint だけで browser に要求する。
 */
import {
    resolveTrackerRuntimePerformanceProfile,
    type TrackerRuntimePerformanceProfile,
    type TrackerRuntimePerformanceProfileResolverInput,
} from "../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";

const CAMERA_REQUEST_TIMEOUT_MS = 12000;

export const MOTION_DEBUG_CAMERA_CONSTRAINTS: MediaStreamConstraints =
    createMotionDebugCameraConstraints(
        resolveTrackerRuntimePerformanceProfile({ defaultProfileId: "debug" }).profile,
    );

export function createMotionDebugCameraConstraints(
    profile: TrackerRuntimePerformanceProfile,
): MediaStreamConstraints {
    return {
        video: {
            width: { ideal: profile.camera.idealWidth },
            height: { ideal: profile.camera.idealHeight },
            frameRate: {
                ideal: profile.camera.idealFrameRate,
                max: profile.camera.maxFrameRate,
            },
            facingMode: { ideal: profile.camera.facingMode },
        },
        audio: false,
    };
}

export function requestMotionDebugCameraStream(
    input?: TrackerRuntimePerformanceProfileResolverInput,
): Promise<MediaStream> {
    const constraints = createMotionDebugCameraConstraints(
        resolveTrackerRuntimePerformanceProfile({
            ...input,
            defaultProfileId: input?.defaultProfileId ?? "debug",
        }).profile,
    );
    let timedOut = false;
    let timeoutId = 0;
    const request = navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
        if (timedOut) {
            stream.getTracks().forEach((track) => {
                track.stop();
            });
        }
        return stream;
    });
    const timeout = new Promise<MediaStream>((_, reject) => {
        timeoutId = window.setTimeout(() => {
            timedOut = true;
            reject(new Error(`Camera request timed out after ${CAMERA_REQUEST_TIMEOUT_MS}ms.`));
        }, CAMERA_REQUEST_TIMEOUT_MS);
    });
    return Promise.race([request, timeout]).finally(() => {
        window.clearTimeout(timeoutId);
    });
}
