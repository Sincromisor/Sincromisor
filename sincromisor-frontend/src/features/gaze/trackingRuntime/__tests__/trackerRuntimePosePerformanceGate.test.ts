import { describe, expect, it } from "vitest";

import {
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    type SincroPoseMotionSnapshot,
} from "../../poseTracking/sincroPoseMotionSnapshot";
import { TrackerRuntimePosePerformanceGate } from "../trackerRuntimePosePerformanceGate";

function createPoseSnapshot(
    inferenceTimeMs: number,
    consecutiveFailures = 0,
): SincroPoseMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        inferenceTimeMs,
        consecutiveFailures,
    };
}

function evaluateRepeatedSlowInference(
    gate: TrackerRuntimePosePerformanceGate,
    inferenceTimeMs: number,
) {
    let result = gate.evaluate(createPoseSnapshot(inferenceTimeMs));
    for (let index = 0; index < 9; index += 1) {
        result = gate.evaluate(createPoseSnapshot(inferenceTimeMs));
    }
    return result;
}

describe("TrackerRuntimePosePerformanceGate", () => {
    it("returns full state while pose inference stays inside the performance gate", () => {
        const gate = new TrackerRuntimePosePerformanceGate();
        gate.configure({
            targetPoseInferenceFps: 12,
            ignorePerformanceFallback: false,
        });

        expect(evaluateRepeatedSlowInference(gate, 20)).toEqual({
            state: "full",
            shouldDegradeToFaceOnly: false,
        });
    });

    it("maps slow pose inference to enum reason codes while preserving legacy fallback reason", () => {
        const gate = new TrackerRuntimePosePerformanceGate();
        gate.configure({
            targetPoseInferenceFps: 12,
            ignorePerformanceFallback: false,
        });

        expect(evaluateRepeatedSlowInference(gate, 80)).toEqual({
            state: "face-only",
            reason: "pose_inference_warn",
            fallbackReason: "pose_inference_too_slow",
            shouldDegradeToFaceOnly: true,
        });
    });

    it("keeps degradation state but suppresses face-only fallback when ignored", () => {
        const gate = new TrackerRuntimePosePerformanceGate();
        gate.configure({
            targetPoseInferenceFps: 12,
            ignorePerformanceFallback: true,
        });

        expect(evaluateRepeatedSlowInference(gate, 120)).toEqual({
            state: "face-only",
            reason: "pose_inference_over_budget",
            fallbackReason: "pose_inference_too_slow",
            shouldDegradeToFaceOnly: false,
        });
    });

    it("keeps repeated pose failures as a face-only hard fallback", () => {
        const gate = new TrackerRuntimePosePerformanceGate();
        gate.configure({
            targetPoseInferenceFps: 12,
            ignorePerformanceFallback: true,
        });

        expect(gate.evaluate(createPoseSnapshot(10, 18))).toEqual({
            state: "face-only",
            reason: "pose_detection_failed_repeatedly",
            fallbackReason: "pose_detection_failed_repeatedly",
            shouldDegradeToFaceOnly: true,
        });
    });
});
