import { describe, expect, it } from "vitest";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalArmState,
    type TemporalPartState,
    type TemporalTuple3,
    type TemporalUpperBodyState,
} from "../../temporal/temporalUpperBodyState";
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
        finalPose?: unknown;
        applied?: unknown;
        metrics?: unknown;
        temporal?: unknown;
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
        finalPose: options?.finalPose,
        applied: options?.applied,
        metrics: options?.metrics,
        temporal: options?.temporal,
    };
}

function createPhase6Solver(options?: {
    leftPoleFlip?: boolean;
    rightPoleFlip?: boolean;
    leftTargetClamped?: boolean;
    rightTargetClamped?: boolean;
    leftPoleUncertain?: boolean;
}): unknown {
    return {
        phase6: {
            schemaVersion: "sincro.phase6-solver.v1",
            profile: {
                schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
                optionalBones: {
                    leftHand: true,
                    rightHand: true,
                },
                measurements: {
                    shoulderWidth: 0.4,
                },
                solverDefaults: {
                    defaultReachScale: 1,
                    depthCompression: 0.55,
                    lateralScale: 1,
                    verticalScale: 0.92,
                    shoulderDamping: 0.65,
                    wristRollInfluence: 0.25,
                },
                warnings: [],
            },
            arms: {
                left: {
                    ik: {
                        active: true,
                        targetClamped: options?.leftTargetClamped ?? false,
                        weight: 0.8,
                        poleState: options?.leftPoleUncertain ? "uncertain" : "stable",
                        constraintReasonCodes: options?.leftPoleFlip ? ["pole_flip_rejected"] : [],
                    },
                },
                right: {
                    ik: {
                        active: true,
                        targetClamped: options?.rightTargetClamped ?? false,
                        weight: 0.7,
                        poleState: "stable",
                        constraintReasonCodes: options?.rightPoleFlip ? ["pole_flip_rejected"] : [],
                    },
                },
            },
            warnings: [],
        },
    };
}

function createFinalPose(options?: {
    angularVelocityClamped?: boolean;
    ownedBoneConflict?: boolean;
}): unknown {
    return {
        schemaVersion: "sincro.vrm-pose-composer-result.v1",
        finalPose: {
            leftUpperArm: { x: 0, y: 0, z: 0, w: 1 },
            rightUpperArm: { x: 0, y: 0, z: 0, w: 1 },
        },
        ownedBones: ["leftUpperArm", "rightUpperArm"],
        suppressedLayers: [],
        clampedBones: options?.angularVelocityClamped
            ? [
                  {
                      bone: "leftUpperArm",
                      reason: "angular_velocity",
                      after: { x: 0, y: 0, z: 0, w: 1 },
                  },
              ]
            : [],
        warnings: options?.ownedBoneConflict
            ? ["owned_bone_conflict:leftUpperArm", "unsupported_bone:hips"]
            : ["unsupported_bone:hips"],
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

function createTemporalArm(
    base: TemporalArmState,
    options?: {
        state?: TemporalPartState;
        wrist?: TemporalTuple3;
        reach?: number;
        elevationRad?: number;
        openness?: number;
        forwardness?: number;
        elbowFlexionRad?: number;
    },
): TemporalArmState {
    return {
        ...base,
        state: options?.state ?? "tracked",
        confidence: options?.state === "lost" ? 0 : 0.9,
        source: options?.state === "recovering" ? "mixed" : "canonical",
        warnings: options?.state === "recovering" ? ["recovery_blend"] : [],
        bodyLocalWrist: options?.wrist ?? [0.1, 0.2, 0.3],
        reach: options?.reach ?? base.reach,
        elevationRad: options?.elevationRad ?? base.elevationRad,
        openness: options?.openness ?? base.openness,
        forwardness: options?.forwardness ?? base.forwardness,
        elbowFlexionRad: options?.elbowFlexionRad ?? base.elbowFlexionRad,
        recoveringBlend:
            options?.state === "recovering"
                ? {
                      from: "predicted",
                      progress: 0.5,
                      durationMs: 260,
                  }
                : undefined,
    };
}

function createTemporalState(
    mediaTimeMs: number,
    options?: {
        temporalMediaTimeMs?: number;
        left?: Parameters<typeof createTemporalArm>[1];
        right?: Parameters<typeof createTemporalArm>[1];
    },
): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(
        options?.temporalMediaTimeMs ?? mediaTimeMs,
    );
    return {
        ...temporal,
        arms: {
            left: createTemporalArm(temporal.arms.left, options?.left),
            right: createTemporalArm(temporal.arms.right, options?.right),
        },
        warnings: [],
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
        expect(summary.metrics.solverReachClampOccupancy).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
        });
        expect(summary.severity).toBe("warn");
    });

    it("calculates Phase 6 solver and finalPose metrics from saved snapshots", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    solver: createPhase6Solver({
                        leftPoleFlip: true,
                        leftTargetClamped: true,
                        leftPoleUncertain: true,
                    }),
                    finalPose: createFinalPose({ angularVelocityClamped: true }),
                }),
                createFrame(1, 100, {
                    solver: createPhase6Solver({ rightTargetClamped: true }),
                    finalPose: createFinalPose({ ownedBoneConflict: true }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.solverElbowFlipRejectCount).toMatchObject({
            value: 1,
            status: "pass",
            sampleCount: 4,
        });
        expect(summary.metrics.solverReachClampOccupancy).toMatchObject({
            value: 0.5,
            status: "fail",
            sampleCount: 4,
        });
        expect(summary.metrics.solverPoleUncertainFrameCount).toMatchObject({
            value: 1,
            status: "pass",
            sampleCount: 4,
        });
        expect(summary.metrics.finalPoseAngularVelocityClampCount).toMatchObject({
            value: 1,
            status: "warn",
            sampleCount: 4,
        });
        expect(summary.metrics.finalPoseOwnedBoneConflictCount).toMatchObject({
            value: 1,
            status: "fail",
            sampleCount: 4,
        });
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

    it("calculates temporal arm-frame counts and recovery jump thresholds", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    temporal: createTemporalState(0, {
                        left: { state: "predicted", elevationRad: 0 },
                        right: { state: "tracked", elevationRad: 0 },
                    }),
                }),
                createFrame(1, 100, {
                    temporal: createTemporalState(100, {
                        left: {
                            state: "recovering",
                            elevationRad: (20 * Math.PI) / 180,
                        },
                        right: {
                            state: "recovering",
                            reach: 0.35,
                        },
                    }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.temporalPredictedArmFrameCount).toMatchObject({
            value: 1,
            unit: "count",
            status: "warn",
            sampleCount: 4,
            threshold: { pass: 0, warn: 40, fail: 120 },
        });
        expect(summary.metrics.temporalRecoveringArmFrameCount).toMatchObject({
            value: 2,
            unit: "count",
            status: "warn",
            sampleCount: 4,
            threshold: { pass: 0, warn: 30, fail: 90 },
        });
        expect(summary.metrics.temporalMaxRecoveryJumpDegEquivalent).toMatchObject({
            value: 20,
            unit: "deg",
            status: "warn",
            sampleCount: 2,
            threshold: { pass: 15, warn: 25, fail: 45 },
        });
    });

    it("calculates temporal lost duration and neutral wrist jitter from temporal samples", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    temporal: createTemporalState(0, {
                        left: { state: "lost" },
                        right: { state: "tracked", wrist: [0, 0, 0] },
                    }),
                }),
                createFrame(1, 300, {
                    temporal: createTemporalState(300, {
                        left: { state: "lost" },
                        right: { state: "suspect", wrist: [0.02, 0, 0] },
                    }),
                }),
                createFrame(2, 400, {
                    temporal: createTemporalState(400, {
                        left: { state: "tracked", wrist: [0.01, 0, 0] },
                        right: { state: "tracked", wrist: [0.04, 0, 0] },
                    }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.temporalLostArmDurationMs).toMatchObject({
            value: 350,
            unit: "ms",
            status: "warn",
            sampleCount: 3,
            threshold: { pass: 250, warn: 1000, fail: 2500 },
        });
        expect(summary.metrics.temporalNeutralWristJitter).toMatchObject({
            value: 0.02,
            unit: "ratio",
            status: "warn",
            sampleCount: 4,
        });
    });

    it("uses frame timestamps for temporal lost duration when temporal timestamps mismatch", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    temporal: createTemporalState(0, {
                        temporalMediaTimeMs: 1000,
                        left: { state: "lost" },
                        right: { state: "lost" },
                    }),
                }),
                createFrame(1, 400, {
                    temporal: createTemporalState(400, {
                        temporalMediaTimeMs: 1010,
                        left: { state: "tracked" },
                        right: { state: "tracked" },
                    }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.temporalLostArmDurationMs).toMatchObject({
            value: 500,
            unit: "ms",
            status: "warn",
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
