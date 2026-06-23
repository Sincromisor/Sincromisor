import { describe, expect, it } from "vitest";
import type { SincroMotionDebugFrame } from "../motionDebugLogSchema";
import {
    calculateMotionMetricSummary,
    compareMotionMetricSummaries,
    type MotionMetricConfig,
} from "../motionMetrics";

const CONFIG: MotionMetricConfig = {
    fixtureId: "neutral-10s",
    generatedAtIso: "2026-06-23T12:00:00.000Z",
    thresholdVersion: "initial-v1",
};

function createFrame(
    frameIndex: number,
    mediaTimeMs: number,
    options?: {
        poseSnapshot?: unknown;
        solver?: unknown;
        applied?: unknown;
        metrics?: unknown;
    },
): SincroMotionDebugFrame {
    return {
        frameIndex,
        timestamp: { mediaTimeMs },
        video: {
            width: 1280,
            height: 720,
        },
        poseSnapshot: options?.poseSnapshot,
        solver: options?.solver,
        applied: options?.applied,
        metrics: options?.metrics,
    };
}

function createPoseSnapshot(options?: {
    detected?: boolean;
    degradedToFaceOnly?: boolean;
    consecutiveFailures?: number;
    leftX?: number;
    rightX?: number;
    leftConfidence?: number;
    rightConfidence?: number;
}): unknown {
    return {
        trackingEnabled: true,
        detected: options?.detected ?? true,
        confidence: 0.9,
        upperBody: {
            shoulderRoll: 0,
            torsoLean: 0,
            shoulderWidth: 0.42,
            shoulderCenterX: 0.5,
            shoulderCenterY: 0.5,
            hipCenterTracked: true,
        },
        leftArm: {
            tracked: true,
            confidence: 0.8,
            upperArmLift: 0,
            upperArmOpen: 0,
            lowerArmFlex: 0,
            wristRaise: 0,
            targets: {
                wrist: {
                    cameraX: options?.leftX ?? 0.4,
                    cameraY: 0.52,
                    confidence: options?.leftConfidence ?? 0.9,
                },
            },
        },
        rightArm: {
            tracked: true,
            confidence: 0.8,
            upperArmLift: 0,
            upperArmOpen: 0,
            lowerArmFlex: 0,
            wristRaise: 0,
            targets: {
                wrist: {
                    cameraX: options?.rightX ?? 0.6,
                    cameraY: 0.52,
                    confidence: options?.rightConfidence ?? 0.9,
                },
            },
        },
        inferenceTimeMs: 8,
        inferenceFps: 12,
        consecutiveFailures: options?.consecutiveFailures ?? 0,
        degradedToFaceOnly: options?.degradedToFaceOnly ?? false,
    };
}

function createPoseRetarget(options?: {
    leftJointLimited?: boolean;
    rightJointLimited?: boolean;
    leftTargetPushDistance?: number;
    rightTargetPushDistance?: number;
    leftReasons?: string[];
    upperArmQuaternionW?: number;
}): unknown {
    return {
        poseRetarget: {
            leftArm: {
                constraint: {
                    reasons: options?.leftReasons ?? [],
                    jointLimited: options?.leftJointLimited ?? false,
                    targetPushDistance: options?.leftTargetPushDistance ?? 0,
                },
                upperArmQuaternion: {
                    x: 0,
                    y: 0,
                    z: 0,
                    w: options?.upperArmQuaternionW ?? 1,
                },
            },
            rightArm: {
                constraint: {
                    reasons: [],
                    jointLimited: options?.rightJointLimited ?? false,
                    targetPushDistance: options?.rightTargetPushDistance ?? 0,
                },
                upperArmQuaternion: {
                    x: 0,
                    y: 0,
                    z: 0,
                    w: 1,
                },
            },
        },
    };
}

describe("calculateMotionMetricSummary", () => {
    it("calculates tracking loss duration from timestamp intervals", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, { poseSnapshot: createPoseSnapshot() }),
                createFrame(1, 100, {
                    poseSnapshot: createPoseSnapshot({ detected: false }),
                }),
                createFrame(2, 250, {
                    poseSnapshot: createPoseSnapshot({ degradedToFaceOnly: true }),
                }),
                createFrame(3, 400, { poseSnapshot: createPoseSnapshot() }),
            ],
            CONFIG,
        );

        expect(summary.metrics.trackingLossDurationMs).toMatchObject({
            value: 300,
            status: "warn",
            sampleCount: 4,
        });
    });

    it("calculates reach clamp occupancy from jointLimited or targetPushDistance", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, { solver: createPoseRetarget() }),
                createFrame(1, 100, {
                    solver: createPoseRetarget({ leftJointLimited: true }),
                }),
                createFrame(2, 200, {
                    solver: createPoseRetarget({ rightTargetPushDistance: 0.12 }),
                }),
                createFrame(3, 300, {
                    solver: createPoseRetarget({ leftReasons: ["head_collision_avoided"] }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.reachClampOccupancy).toMatchObject({
            value: 0.5,
            status: "fail",
            sampleCount: 4,
        });
    });

    it("marks missing input slots as not_available and keeps the summary from passing", () => {
        const summary = calculateMotionMetricSummary([createFrame(0, 0)], CONFIG);

        expect(summary.metrics.trackingLossDurationMs).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
        });
        expect(summary.metrics.reachClampOccupancy).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
        });
        expect(summary.metrics.addedLatencyMs).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
        });
        expect(summary.severity).toBe("warn");
    });

    it("uses tracker.workerRoundTripMs p95 for addedLatencyMs", () => {
        const summary = calculateMotionMetricSummary(
            [20, 40, 80, 120, 240].map((roundTripMs, index) =>
                createFrame(index, index * 100, {
                    metrics: {
                        receivedAtPerformanceMs: 100000 + index,
                        tracker: { workerRoundTripMs: roundTripMs },
                    },
                }),
            ),
            CONFIG,
        );

        expect(summary.metrics.addedLatencyMs).toMatchObject({
            value: 240,
            status: "fail",
            sampleCount: 5,
        });
    });

    it("counts side swaps only when both wrist confidences are above 0.5", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    poseSnapshot: createPoseSnapshot({ leftX: 0.4, rightX: 0.6 }),
                }),
                createFrame(1, 100, {
                    poseSnapshot: createPoseSnapshot({
                        leftX: 0.7,
                        rightX: 0.3,
                        leftConfidence: 0.4,
                    }),
                }),
                createFrame(2, 200, {
                    poseSnapshot: createPoseSnapshot({ leftX: 0.7, rightX: 0.3 }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.sideSwapCount).toMatchObject({
            value: 1,
            status: "warn",
            sampleCount: 3,
        });
    });

    it("calculates recovery jump from the 500ms recovery window", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, { poseSnapshot: createPoseSnapshot() }),
                createFrame(1, 100, {
                    poseSnapshot: createPoseSnapshot({ detected: false }),
                }),
                createFrame(2, 200, {
                    poseSnapshot: createPoseSnapshot(),
                    applied: { angularVelocityDegPerSec: { leftUpperArm: 600 } },
                }),
                createFrame(3, 650, {
                    poseSnapshot: createPoseSnapshot(),
                    applied: { angularVelocityDegPerSec: { leftUpperArm: 1200 } },
                }),
                createFrame(4, 720, {
                    poseSnapshot: createPoseSnapshot(),
                    applied: { angularVelocityDegPerSec: { leftUpperArm: 2400 } },
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.recoveryJumpAngleDeg).toMatchObject({
            value: 20,
            status: "fail",
            sampleCount: 2,
        });
    });
});

describe("compareMotionMetricSummaries", () => {
    it("reports regressed when candidate moves in the worse direction", () => {
        const baseline = calculateMotionMetricSummary(
            [
                createFrame(0, 0, { solver: createPoseRetarget() }),
                createFrame(1, 100, { solver: createPoseRetarget() }),
            ],
            CONFIG,
        );
        const candidate = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    solver: createPoseRetarget({ leftJointLimited: true }),
                }),
                createFrame(1, 100, {
                    solver: createPoseRetarget({ rightTargetPushDistance: 0.1 }),
                }),
            ],
            CONFIG,
        );

        expect(compareMotionMetricSummaries(baseline, candidate).reachClampOccupancy).toMatchObject(
            {
                status: "regressed",
                baselineValue: 0,
                candidateValue: 1,
                severityChanged: true,
            },
        );
    });
});
