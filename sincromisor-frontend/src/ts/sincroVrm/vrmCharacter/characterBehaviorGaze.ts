import type { Detection } from "@mediapipe/tasks-vision";
import type { CharacterGaze } from "../../characterGaze/characterGaze";
import { BEHAVIOR_TIMING, type CharacterBehaviorGazeSnapshot } from "./characterBehaviorTypes";

type ApplyCharacterBehaviorGazeStateOptions = {
    characterGaze: CharacterGaze;
    detections: Detection[];
    currentGaze: CharacterBehaviorGazeSnapshot;
    nowMs: number;
};

export function applyCharacterBehaviorGazeState(
    options: ApplyCharacterBehaviorGazeStateOptions,
): CharacterBehaviorGazeSnapshot {
    const rawDetected = options.detections.length > 0;
    const detected = options.characterGaze.detecting();
    return {
        trackingEnabled: true,
        detected,
        rawDetected,
        targetX: options.characterGaze.targetX(),
        targetY: options.characterGaze.targetY(),
        facing: options.characterGaze.facing(),
        detectionCount: options.detections.length,
        lastDetectedAtMs: detected ? options.nowMs : options.currentGaze.lastDetectedAtMs,
        lastUpdatedAtMs: options.nowMs,
    };
}

export function setCharacterBehaviorGazeTrackingEnabled(
    currentGaze: CharacterBehaviorGazeSnapshot,
    enabled: boolean,
    nowMs: number,
): CharacterBehaviorGazeSnapshot {
    return {
        ...currentGaze,
        trackingEnabled: enabled,
        rawDetected: enabled ? currentGaze.rawDetected : false,
        detected: enabled ? currentGaze.detected : false,
        detectionCount: enabled ? currentGaze.detectionCount : 0,
        lastUpdatedAtMs: nowMs,
    };
}

export function refreshStaleCharacterBehaviorGaze(
    currentGaze: CharacterBehaviorGazeSnapshot,
    nowMs: number,
): CharacterBehaviorGazeSnapshot {
    if (
        !currentGaze.trackingEnabled ||
        currentGaze.lastUpdatedAtMs === undefined ||
        nowMs - currentGaze.lastUpdatedAtMs <= BEHAVIOR_TIMING.gazeStaleMs
    ) {
        return currentGaze;
    }
    return {
        ...currentGaze,
        detected: false,
        rawDetected: false,
        targetX: 0.5,
        targetY: 0.5,
        facing: 0.5,
        detectionCount: 0,
        lastUpdatedAtMs: nowMs,
    };
}
