import { describe, expect, it } from "vitest";
import {
    type ArmMotionIntent,
    createDefaultMotionIntentState,
    type MotionIntentWarningCode,
} from "../../motionIntent/motionIntentState";
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
        intent?: unknown;
        droppedPresentedFrames?: number;
    },
): SincroMotionDebugFrame {
    const timestamp =
        options?.droppedPresentedFrames === undefined
            ? { mediaTimeMs }
            : { mediaTimeMs, droppedPresentedFrames: options.droppedPresentedFrames };
    return {
        frameIndex,
        timestamp,
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
        intent: options?.intent,
    };
}

function createTrackerMetrics(options?: {
    budgetStatus?: "ok" | "warn" | "over_budget";
    droppedFrames?: number;
    policyStage?:
        | "full"
        | "gesture-reduced-fps"
        | "optional-pass-reduced-fps"
        | "roi-hand-paused"
        | "pose-reduced-fps"
        | "face-only"
        | "comfortable-idle";
    legacyDegradationState?: string;
    recovering?: boolean;
    roiPauseState?: "active" | "hand-paused" | "face-paused" | "all-paused";
}): unknown {
    return {
        tracker: {
            droppedFrames: options?.droppedFrames,
            budget:
                options?.budgetStatus !== undefined || options?.legacyDegradationState !== undefined
                    ? {
                          budgetStatus: options?.budgetStatus,
                          degradation:
                              options?.legacyDegradationState === undefined
                                  ? undefined
                                  : { state: options.legacyDegradationState },
                      }
                    : undefined,
            degradationPolicy:
                options?.policyStage === undefined && options?.recovering === undefined
                    ? undefined
                    : {
                          schemaVersion: "sincro.tracker-degradation-policy.v1",
                          stage: options?.policyStage ?? "full",
                          reasonCodes: [],
                          effectiveCadence: {
                              faceFps: 12,
                              poseFps: 8,
                              handFps: 4,
                              faceRoiFps: 6,
                              gestureFps: 3,
                          },
                          recovering: options?.recovering ?? false,
                      },
            roi:
                options?.roiPauseState === undefined
                    ? undefined
                    : {
                          pauseState: options.roiPauseState,
                          fallbackCount: 0,
                          skippedFrames: 0,
                          consecutiveOverBudgetFrames: 0,
                          reasonCodes: [],
                      },
        },
    };
}

function createPhase6Solver(options?: {
    leftPoleFlip?: boolean;
    rightPoleFlip?: boolean;
    leftTargetClamped?: boolean;
    rightTargetClamped?: boolean;
    leftPoleUncertain?: boolean;
    reachExcesses?: [number, number];
    omitRightReach?: boolean;
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
                    reach:
                        options?.reachExcesses === undefined
                            ? undefined
                            : {
                                  requestedReachRatio: 1 + options.reachExcesses[0],
                                  appliedReachRatio: 1,
                                  excessReachRatio: options.reachExcesses[0],
                                  clampedBy: options.reachExcesses[0] > 0 ? "bridge" : "none",
                              },
                    ik: {
                        active: true,
                        targetClamped: options?.leftTargetClamped ?? false,
                        weight: 0.8,
                        poleState: options?.leftPoleUncertain ? "uncertain" : "stable",
                        constraintReasonCodes: options?.leftPoleFlip ? ["pole_flip_rejected"] : [],
                    },
                },
                right: {
                    reach:
                        options?.reachExcesses === undefined || options.omitRightReach
                            ? undefined
                            : {
                                  requestedReachRatio: 1 + options.reachExcesses[1],
                                  appliedReachRatio: 1,
                                  excessReachRatio: options.reachExcesses[1],
                                  clampedBy: options.reachExcesses[1] > 0 ? "solver" : "none",
                              },
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

function createIntentState(
    mediaTimeMs: number,
    options?: {
        left?: Partial<{
            intent: ArmMotionIntent;
            stableDurationMs: number;
            warnings: MotionIntentWarningCode[];
        }>;
        right?: Partial<{
            intent: ArmMotionIntent;
            stableDurationMs: number;
            warnings: MotionIntentWarningCode[];
        }>;
    },
): ReturnType<typeof createDefaultMotionIntentState> {
    const state = createDefaultMotionIntentState(mediaTimeMs);
    return {
        ...state,
        arms: {
            left: {
                ...state.arms.left,
                intent: options?.left?.intent ?? state.arms.left.intent,
                stableDurationMs:
                    options?.left?.stableDurationMs ?? state.arms.left.stableDurationMs,
                warnings: options?.left?.warnings ?? state.arms.left.warnings,
            },
            right: {
                ...state.arms.right,
                intent: options?.right?.intent ?? state.arms.right.intent,
                stableDurationMs:
                    options?.right?.stableDurationMs ?? state.arms.right.stableDurationMs,
                warnings: options?.right?.warnings ?? state.arms.right.warnings,
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
                        reachExcesses: [0.01, 0.02],
                    }),
                    finalPose: createFinalPose({ angularVelocityClamped: true }),
                }),
                createFrame(1, 100, {
                    solver: createPhase6Solver({
                        rightTargetClamped: true,
                        reachExcesses: [0.03, 0.2],
                    }),
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
        expect(summary.metrics.solverExcessReachRatioP95).toMatchObject({
            value: 0.2,
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

    it("counts Phase 10 tracker degradation metrics from saved tracker stats", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    droppedPresentedFrames: 0,
                    metrics: createTrackerMetrics({
                        budgetStatus: "ok",
                        droppedFrames: 0,
                        policyStage: "full",
                        recovering: false,
                        roiPauseState: "active",
                    }),
                }),
                createFrame(1, 100, {
                    droppedPresentedFrames: 1,
                    metrics: createTrackerMetrics({
                        budgetStatus: "warn",
                        droppedFrames: 2,
                        policyStage: "gesture-reduced-fps",
                        recovering: false,
                        roiPauseState: "hand-paused",
                    }),
                }),
                createFrame(2, 200, {
                    droppedPresentedFrames: 5,
                    metrics: createTrackerMetrics({
                        budgetStatus: "over_budget",
                        droppedFrames: 3,
                        policyStage: "full",
                        recovering: true,
                        roiPauseState: "active",
                    }),
                }),
                createFrame(3, 300, {
                    metrics: createTrackerMetrics({
                        budgetStatus: "over_budget",
                        droppedFrames: 7,
                        legacyDegradationState: "face-only",
                        roiPauseState: "face-paused",
                    }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.trackerBudgetOverrunFrameCount).toMatchObject({
            value: 2,
            unit: "count",
            direction: "lower_is_better",
            status: "warn",
            sampleCount: 4,
            threshold: { pass: 0, warn: 30, fail: 90 },
        });
        expect(summary.metrics.trackerDroppedFrameCount).toMatchObject({
            value: 11,
            unit: "count",
            status: "warn",
            sampleCount: 4,
            threshold: { pass: 0, warn: 15, fail: 60 },
        });
        expect(summary.metrics.degradationStageFrameCount).toMatchObject({
            value: 2,
            unit: "count",
            status: "warn",
            sampleCount: 4,
            threshold: { pass: 0, warn: 45, fail: 150 },
        });
        expect(summary.metrics.degradationRecoveryFrameCount).toMatchObject({
            value: 1,
            unit: "count",
            status: "warn",
            sampleCount: 3,
            threshold: { pass: 0, warn: 60, fail: 180 },
        });
        expect(summary.metrics.roiPausedFrameCount).toMatchObject({
            value: 2,
            unit: "count",
            status: "warn",
            sampleCount: 4,
            threshold: { pass: 0, warn: 60, fail: 180 },
        });
    });

    it("uses the larger per-frame dropped source without double-counting tracker cumulative frames", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    droppedPresentedFrames: 1,
                    metrics: createTrackerMetrics({ droppedFrames: 10 }),
                }),
                createFrame(1, 100, {
                    droppedPresentedFrames: 1,
                    metrics: createTrackerMetrics({ droppedFrames: 12 }),
                }),
                createFrame(2, 200, {
                    droppedPresentedFrames: 5,
                    metrics: createTrackerMetrics({ droppedFrames: 15 }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.trackerDroppedFrameCount).toMatchObject({
            value: 8,
            status: "warn",
            sampleCount: 3,
        });
    });

    it("uses legacy budget degradation state but keeps new policy-only metrics unavailable", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    metrics: createTrackerMetrics({
                        legacyDegradationState: "pose-reduced-fps",
                    }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.degradationStageFrameCount).toMatchObject({
            value: 1,
            status: "warn",
            sampleCount: 1,
        });
        expect(summary.metrics.degradationRecoveryFrameCount).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
            sampleCount: 0,
        });
        expect(summary.metrics.roiPausedFrameCount).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
            sampleCount: 0,
        });
        expect(summary.metrics.trackerBudgetOverrunFrameCount).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
            sampleCount: 0,
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

    it("calculates intent metrics from saved frame intent", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    intent: createIntentState(0, {
                        left: { intent: "wave", stableDurationMs: 80 },
                    }),
                }),
                createFrame(1, 100, {
                    intent: createIntentState(100, {
                        left: { intent: "tracking", warnings: ["gesture_cooldown"] },
                        right: { intent: "fallback" },
                    }),
                }),
                createFrame(2, 200, {
                    intent: createIntentState(200, {
                        left: { intent: "pointing", stableDurationMs: 120 },
                        right: { intent: "lost" },
                    }),
                }),
                createFrame(3, 300, {
                    intent: createIntentState(300, {
                        left: { intent: "peace", stableDurationMs: 40 },
                    }),
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.gestureFlickerCount).toMatchObject({
            value: 2,
            unit: "count",
            direction: "lower_is_better",
            status: "warn",
            threshold: { pass: 0, warn: 2, fail: 5 },
            sampleCount: 8,
        });
        expect(summary.metrics.semanticFallbackFrameCount).toMatchObject({
            value: 2,
            unit: "count",
            status: "pass",
            threshold: { pass: 30, warn: 120, fail: 240 },
            sampleCount: 8,
        });
        expect(summary.metrics.intentCooldownSuppressionCount).toMatchObject({
            value: 1,
            unit: "count",
            status: "warn",
            threshold: { pass: 0, warn: 20, fail: 60 },
            sampleCount: 8,
        });
        expect(summary.metrics.intentInvalidFrameCount).toMatchObject({
            value: 0,
            unit: "count",
            status: "pass",
            threshold: { pass: 0, warn: 1, fail: 3 },
            sampleCount: 4,
        });
    });

    it("marks intent metrics as not_available for older logs without frame intent", () => {
        const summary = calculateMotionMetricSummary([createFrame(0, 0)], CONFIG);

        expect(summary.metrics.gestureFlickerCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
        expect(summary.metrics.semanticFallbackFrameCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
        expect(summary.metrics.intentCooldownSuppressionCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
        expect(summary.metrics.intentInvalidFrameCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
    });

    it("counts invalid intent frames only in intentInvalidFrameCount", () => {
        const summary = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    intent: {
                        ...createIntentState(0),
                        arms: {
                            ...createIntentState(0).arms,
                            left: {
                                ...createIntentState(0).arms.left,
                                intent: "thumbs_up",
                            },
                        },
                    },
                }),
            ],
            CONFIG,
        );

        expect(summary.metrics.intentInvalidFrameCount).toMatchObject({
            value: 1,
            status: "warn",
            sampleCount: 1,
        });
        expect(summary.metrics.gestureFlickerCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
        expect(summary.metrics.semanticFallbackFrameCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
        expect(summary.metrics.intentCooldownSuppressionCount).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "intent_not_recorded",
        });
    });
});

describe("compareMotionMetricSummaries", () => {
    it("reports regressed when candidate moves in the worse direction", () => {
        const baseline = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    solver: createPoseRetarget(),
                    metrics: createTrackerMetrics({ budgetStatus: "ok" }),
                }),
                createFrame(1, 100, {
                    solver: createPoseRetarget(),
                    metrics: createTrackerMetrics({ budgetStatus: "ok" }),
                }),
            ],
            CONFIG,
        );
        const candidate = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    solver: createPoseRetarget({ leftJointLimited: true }),
                    metrics: createTrackerMetrics({ budgetStatus: "over_budget" }),
                }),
                createFrame(1, 100, {
                    solver: createPoseRetarget({ rightTargetPushDistance: 0.1 }),
                    metrics: createTrackerMetrics({ budgetStatus: "ok" }),
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
        expect(
            compareMotionMetricSummaries(baseline, candidate).trackerBudgetOverrunFrameCount,
        ).toMatchObject({
            status: "regressed",
            baselineValue: 0,
            candidateValue: 1,
            severityChanged: true,
        });
    });

    it("does not calculate excess reach p95 from old or partially recorded logs", () => {
        const oldLog = calculateMotionMetricSummary(
            [createFrame(0, 0, { solver: createPhase6Solver() })],
            CONFIG,
        );
        const partial = calculateMotionMetricSummary(
            [
                createFrame(0, 0, {
                    solver: createPhase6Solver({
                        reachExcesses: [0.01, 0.02],
                        omitRightReach: true,
                    }),
                }),
            ],
            CONFIG,
        );

        for (const summary of [oldLog, partial]) {
            expect(summary.metrics.solverExcessReachRatioP95).toMatchObject({
                value: null,
                status: "not_available",
                sampleCount: 0,
                unavailableReason: "reach_diagnostics_not_recorded",
            });
        }
    });

    it("returns unavailable for zero arm samples and uses nearest-rank p95", () => {
        const empty = calculateMotionMetricSummary([], CONFIG);
        expect(empty.metrics.solverExcessReachRatioP95).toMatchObject({
            value: null,
            status: "not_available",
            sampleCount: 0,
            unavailableReason: "reach_diagnostics_not_recorded",
        });

        const frames = Array.from({ length: 10 }, (_, index) =>
            createFrame(index, index * 100, {
                solver: createPhase6Solver({
                    reachExcesses: [index / 100, (index + 10) / 100],
                }),
            }),
        );
        const summary = calculateMotionMetricSummary(frames, CONFIG);
        expect(summary.metrics.solverExcessReachRatioP95).toMatchObject({
            value: 0.18,
            sampleCount: 20,
        });
    });
});
