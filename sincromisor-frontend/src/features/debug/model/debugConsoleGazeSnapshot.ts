import {
    createDefaultFaceMotionSnapshot,
    createDefaultPoseMotionSnapshot,
} from "./debugConsoleMotionSnapshot";
import type { CharacterGazeTrackingTuningUiConfig } from "./debugConsolePublicTypes";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

export function updateGazeFaceX(
    snapshot: DebugConsoleSnapshot,
    value: number,
): DebugConsoleSnapshot {
    return updateGazeSnapshot(snapshot, { faceX: `${value}` });
}

export function updateGazeFaceY(
    snapshot: DebugConsoleSnapshot,
    value: number,
): DebugConsoleSnapshot {
    return updateGazeSnapshot(snapshot, { faceY: `${value}` });
}

export function updateGazeFacing(
    snapshot: DebugConsoleSnapshot,
    value: number,
): DebugConsoleSnapshot {
    return updateGazeSnapshot(snapshot, { facing: `${value}` });
}

export function updateGazeEyeStatus(
    snapshot: DebugConsoleSnapshot,
    watching: boolean,
): DebugConsoleSnapshot {
    return updateGazeSnapshot(snapshot, { status: watching ? "みてる" : "みてない" });
}

export function updateGazeTargetDebug(
    snapshot: DebugConsoleSnapshot,
    message: string,
): DebugConsoleSnapshot {
    return updateGazeSnapshot(snapshot, { targetDebug: message });
}

export function updateGazePaused(
    snapshot: DebugConsoleSnapshot,
    paused: boolean,
): DebugConsoleSnapshot {
    if (!paused) {
        return updateGazeSnapshot(snapshot, {
            paused: false,
            status: "みてない",
            targetDebug: "-",
        });
    }
    return {
        ...snapshot,
        gaze: {
            ...snapshot.gaze,
            paused: true,
            faceX: "停止中",
            faceY: "停止中",
            facing: "停止中",
            status: "停止中",
            targetDebug: "停止中",
        },
        sincroMotion: {
            face: {
                ...createDefaultFaceMotionSnapshot(),
                fallbackReason: "tracking_paused",
                lastUpdatedAtMs: performance.now(),
            },
            pose: {
                ...createDefaultPoseMotionSnapshot(),
                fallbackReason: "tracking_paused",
                lastUpdatedAtMs: performance.now(),
            },
            tracker: {
                ...snapshot.sincroMotion.tracker,
                status: "idle",
            },
            poseRetarget: snapshot.sincroMotion.poseRetarget,
            poseRetargetRuntime: {
                ...snapshot.sincroMotion.poseRetargetRuntime,
                active: false,
                ikMode: "fallback",
                fallbackReason: "tracking_paused",
                anchor: {
                    ...snapshot.sincroMotion.poseRetargetRuntime.anchor,
                    active: false,
                    reason: "tracking_paused",
                },
            },
        },
    };
}

export function updateGazeTrackingTuning(
    snapshot: DebugConsoleSnapshot,
    config: CharacterGazeTrackingTuningUiConfig,
): DebugConsoleSnapshot {
    return updateGazeSnapshot(snapshot, {
        tuning: {
            ...config,
        },
    });
}

function updateGazeSnapshot(
    snapshot: DebugConsoleSnapshot,
    gazePatch: Partial<DebugConsoleSnapshot["gaze"]>,
): DebugConsoleSnapshot {
    return {
        ...snapshot,
        gaze: {
            ...snapshot.gaze,
            ...gazePatch,
        },
    };
}
