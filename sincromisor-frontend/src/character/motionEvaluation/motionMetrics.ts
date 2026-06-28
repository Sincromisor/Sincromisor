import { Quaternion } from "three/src/math/Quaternion.js";
import { z } from "zod";
import {
    type ArmMotionIntent,
    type MotionIntentSideState,
    type MotionIntentState,
    parseMotionIntentState,
} from "../motionIntent/motionIntentState";
import {
    parseTemporalUpperBodyState,
    type TemporalArmState,
    type TemporalTuple3,
    type TemporalUpperBodyState,
} from "../temporal/temporalUpperBodyState";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import {
    type MotionDebugFinalPoseSnapshot,
    type MotionDebugPhase6SolverSnapshot,
    parseMotionDebugFinalPoseSnapshot,
    parseMotionDebugPhase6SolverSnapshot,
} from "./motionDebugPhase6Snapshot";

export const MOTION_P0_FIXTURE_IDS = [
    "neutral-10s",
    "single-arm-slow-raise",
    "both-arms-slow-raise",
    "hand-out-and-return",
    "arms-cross",
    "fast-wave",
] as const;

export type MotionP0FixtureId = (typeof MOTION_P0_FIXTURE_IDS)[number];

export type MotionMetricKey =
    | "neutralJitter"
    | "elbowFlipCount"
    | "recoveryJumpAngleDeg"
    | "angularVelocitySpikeCount"
    | "reachClampOccupancy"
    | "trackingLossDurationMs"
    | "sideSwapCount"
    | "addedLatencyMs"
    | "temporalPredictedArmFrameCount"
    | "temporalRecoveringArmFrameCount"
    | "temporalLostArmDurationMs"
    | "temporalMaxRecoveryJumpDegEquivalent"
    | "temporalNeutralWristJitter"
    | "solverElbowFlipRejectCount"
    | "solverReachClampOccupancy"
    | "solverPoleUncertainFrameCount"
    | "finalPoseAngularVelocityClampCount"
    | "finalPoseOwnedBoneConflictCount"
    | "gestureFlickerCount"
    | "semanticFallbackFrameCount"
    | "intentCooldownSuppressionCount"
    | "intentInvalidFrameCount"
    | "trackerBudgetOverrunFrameCount"
    | "trackerDroppedFrameCount"
    | "degradationStageFrameCount"
    | "degradationRecoveryFrameCount"
    | "roiPausedFrameCount";

export type MotionMetricSeverity = "pass" | "warn" | "fail";
export type MotionMetricStatus = MotionMetricSeverity | "not_available";
export type MotionMetricDirection = "lower_is_better" | "higher_is_better";
export type MotionMetricUnit = "px" | "deg" | "count" | "ratio" | "ms";

export type MotionMetricThreshold = { pass: number; warn: number; fail: number };

export type MotionMetricResult = {
    key: MotionMetricKey;
    value: number | null;
    unit: MotionMetricUnit;
    status: MotionMetricStatus;
    severity: MotionMetricSeverity;
    direction: MotionMetricDirection;
    threshold: MotionMetricThreshold;
    sampleCount: number;
    unavailableReason?: string;
};

export type MotionMetricSummary = {
    schemaVersion: "sincro.motion-metrics.v1";
    fixtureId?: MotionP0FixtureId;
    generatedAtIso: string;
    frameCount: number;
    durationMs: number;
    severity: MotionMetricSeverity;
    metrics: Record<MotionMetricKey, MotionMetricResult>;
};

export type MotionMetricConfig = {
    fixtureId?: MotionP0FixtureId;
    generatedAtIso: string;
    thresholds?: Partial<Record<MotionMetricKey, MotionMetricThreshold>>;
    thresholdVersion: "initial-v1" | "custom";
};

export type MotionMetricComparison = {
    key: MotionMetricKey;
    status: "improved" | "unchanged" | "regressed" | "not_comparable";
    baselineValue: number | null;
    candidateValue: number | null;
    delta: number | null;
    severityChanged: boolean;
};

export const MOTION_METRIC_KEYS: MotionMetricKey[] = [
    "neutralJitter",
    "elbowFlipCount",
    "recoveryJumpAngleDeg",
    "angularVelocitySpikeCount",
    "reachClampOccupancy",
    "trackingLossDurationMs",
    "sideSwapCount",
    "addedLatencyMs",
    "temporalPredictedArmFrameCount",
    "temporalRecoveringArmFrameCount",
    "temporalLostArmDurationMs",
    "temporalMaxRecoveryJumpDegEquivalent",
    "temporalNeutralWristJitter",
    "solverElbowFlipRejectCount",
    "solverReachClampOccupancy",
    "solverPoleUncertainFrameCount",
    "finalPoseAngularVelocityClampCount",
    "finalPoseOwnedBoneConflictCount",
    "gestureFlickerCount",
    "semanticFallbackFrameCount",
    "intentCooldownSuppressionCount",
    "intentInvalidFrameCount",
    "trackerBudgetOverrunFrameCount",
    "trackerDroppedFrameCount",
    "degradationStageFrameCount",
    "degradationRecoveryFrameCount",
    "roiPausedFrameCount",
];

export const DEFAULT_MOTION_METRIC_THRESHOLDS: Record<MotionMetricKey, MotionMetricThreshold> = {
    neutralJitter: { pass: 0.015, warn: 0.035, fail: 0.06 },
    elbowFlipCount: { pass: 0, warn: 2, fail: 5 },
    recoveryJumpAngleDeg: { pass: 8, warn: 18, fail: 35 },
    angularVelocitySpikeCount: { pass: 0, warn: 3, fail: 8 },
    reachClampOccupancy: { pass: 0.05, warn: 0.18, fail: 0.35 },
    trackingLossDurationMs: { pass: 250, warn: 1000, fail: 2500 },
    sideSwapCount: { pass: 0, warn: 1, fail: 3 },
    addedLatencyMs: { pass: 80, warn: 160, fail: 260 },
    temporalPredictedArmFrameCount: { pass: 0, warn: 40, fail: 120 },
    temporalRecoveringArmFrameCount: { pass: 0, warn: 30, fail: 90 },
    temporalLostArmDurationMs: { pass: 250, warn: 1000, fail: 2500 },
    temporalMaxRecoveryJumpDegEquivalent: { pass: 15, warn: 25, fail: 45 },
    temporalNeutralWristJitter: { pass: 0.015, warn: 0.035, fail: 0.06 },
    solverElbowFlipRejectCount: { pass: 1, warn: 3, fail: 3 },
    solverReachClampOccupancy: { pass: 0.2, warn: 0.4, fail: 0.4 },
    solverPoleUncertainFrameCount: { pass: 2, warn: 5, fail: 5 },
    finalPoseAngularVelocityClampCount: { pass: 0, warn: 2, fail: 2 },
    finalPoseOwnedBoneConflictCount: { pass: 0, warn: 0, fail: 0 },
    gestureFlickerCount: { pass: 0, warn: 2, fail: 5 },
    semanticFallbackFrameCount: { pass: 30, warn: 120, fail: 240 },
    intentCooldownSuppressionCount: { pass: 0, warn: 20, fail: 60 },
    intentInvalidFrameCount: { pass: 0, warn: 1, fail: 3 },
    trackerBudgetOverrunFrameCount: { pass: 0, warn: 30, fail: 90 },
    trackerDroppedFrameCount: { pass: 0, warn: 15, fail: 60 },
    degradationStageFrameCount: { pass: 0, warn: 45, fail: 150 },
    degradationRecoveryFrameCount: { pass: 0, warn: 60, fail: 180 },
    roiPausedFrameCount: { pass: 0, warn: 60, fail: 180 },
};

const METRIC_DEFINITIONS: Record<
    MotionMetricKey,
    { unit: MotionMetricUnit; direction: MotionMetricDirection }
> = {
    neutralJitter: { unit: "ratio", direction: "lower_is_better" },
    elbowFlipCount: { unit: "count", direction: "lower_is_better" },
    recoveryJumpAngleDeg: { unit: "deg", direction: "lower_is_better" },
    angularVelocitySpikeCount: { unit: "count", direction: "lower_is_better" },
    reachClampOccupancy: { unit: "ratio", direction: "lower_is_better" },
    trackingLossDurationMs: { unit: "ms", direction: "lower_is_better" },
    sideSwapCount: { unit: "count", direction: "lower_is_better" },
    addedLatencyMs: { unit: "ms", direction: "lower_is_better" },
    temporalPredictedArmFrameCount: { unit: "count", direction: "lower_is_better" },
    temporalRecoveringArmFrameCount: { unit: "count", direction: "lower_is_better" },
    temporalLostArmDurationMs: { unit: "ms", direction: "lower_is_better" },
    temporalMaxRecoveryJumpDegEquivalent: { unit: "deg", direction: "lower_is_better" },
    temporalNeutralWristJitter: { unit: "ratio", direction: "lower_is_better" },
    solverElbowFlipRejectCount: { unit: "count", direction: "lower_is_better" },
    solverReachClampOccupancy: { unit: "ratio", direction: "lower_is_better" },
    solverPoleUncertainFrameCount: { unit: "count", direction: "lower_is_better" },
    finalPoseAngularVelocityClampCount: { unit: "count", direction: "lower_is_better" },
    finalPoseOwnedBoneConflictCount: { unit: "count", direction: "lower_is_better" },
    gestureFlickerCount: { unit: "count", direction: "lower_is_better" },
    semanticFallbackFrameCount: { unit: "count", direction: "lower_is_better" },
    intentCooldownSuppressionCount: { unit: "count", direction: "lower_is_better" },
    intentInvalidFrameCount: { unit: "count", direction: "lower_is_better" },
    trackerBudgetOverrunFrameCount: { unit: "count", direction: "lower_is_better" },
    trackerDroppedFrameCount: { unit: "count", direction: "lower_is_better" },
    degradationStageFrameCount: { unit: "count", direction: "lower_is_better" },
    degradationRecoveryFrameCount: { unit: "count", direction: "lower_is_better" },
    roiPausedFrameCount: { unit: "count", direction: "lower_is_better" },
};

const trackerBudgetStatusSchema = z.enum(["ok", "warn", "over_budget"]);
const trackerDroppedFramesSchema = z.number().int().nonnegative();
const trackerDegradationStageSchema = z.enum([
    "full",
    "gesture-reduced-fps",
    "optional-pass-reduced-fps",
    "roi-hand-paused",
    "pose-reduced-fps",
    "face-only",
    "comfortable-idle",
]);
const trackerRoiPauseStateSchema = z.enum(["active", "hand-paused", "face-paused", "all-paused"]);

const poseWristSchema = z
    .object({
        cameraX: z.number().finite(),
        cameraY: z.number().finite(),
        confidence: z.number().finite().optional(),
    })
    .passthrough();

const poseSnapshotSchema = z
    .object({
        detected: z.boolean(),
        degradedToFaceOnly: z.boolean().optional(),
        consecutiveFailures: z.number().finite().optional(),
        upperBody: z
            .object({
                shoulderCenterX: z.number().finite(),
                shoulderCenterY: z.number().finite(),
            })
            .passthrough(),
        leftArm: z
            .object({
                targets: z
                    .object({
                        wrist: poseWristSchema,
                    })
                    .passthrough(),
            })
            .passthrough(),
        rightArm: z
            .object({
                targets: z
                    .object({
                        wrist: poseWristSchema,
                    })
                    .passthrough(),
            })
            .passthrough(),
    })
    .passthrough();

const armConstraintSchema = z
    .object({
        reasons: z.array(z.string()).optional(),
        jointLimited: z.boolean().optional(),
        targetPushDistance: z.number().finite().optional(),
    })
    .passthrough();

const quaternionSchema = z
    .object({
        x: z.number().finite(),
        y: z.number().finite(),
        z: z.number().finite(),
        w: z.number().finite(),
    })
    .strict();

const retargetArmSchema = z
    .object({
        constraint: armConstraintSchema.optional(),
        upperArmQuaternion: quaternionSchema.optional(),
        lowerArmQuaternion: quaternionSchema.optional(),
    })
    .passthrough();

const poseRetargetSchema = z
    .object({
        leftArm: retargetArmSchema,
        rightArm: retargetArmSchema,
    })
    .passthrough();

const solverSchema = z
    .object({
        poseRetarget: poseRetargetSchema.optional(),
    })
    .passthrough();

const appliedSchema = z
    .object({
        angularVelocityDegPerSec: z.union([
            z.number().finite(),
            z.record(z.string(), z.number().finite()),
        ]),
    })
    .passthrough();

const trackerMetricsSchema = z
    .object({
        workerRoundTripMs: z.number().finite().optional(),
    })
    .passthrough();

const metricsSchema = z
    .object({
        tracker: trackerMetricsSchema.optional(),
    })
    .passthrough();

type PoseSnapshotMetricInput = z.infer<typeof poseSnapshotSchema>;
type PoseRetargetMetricInput = z.infer<typeof poseRetargetSchema>;
type AppliedMetricInput = z.infer<typeof appliedSchema>;
type QuaternionMetricInput = z.infer<typeof quaternionSchema>;

type NumericMetricComputation =
    | { ok: true; value: number; sampleCount: number }
    | { ok: false; reason: string; sampleCount: number };

type ParsedIntentFrame =
    | { status: "missing" }
    | { status: "invalid" }
    | { status: "valid"; intent: MotionIntentState };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePoseSnapshot(frame: SincroMotionDebugFrame): PoseSnapshotMetricInput | undefined {
    const parsed = poseSnapshotSchema.safeParse(frame.poseSnapshot);
    return parsed.success ? parsed.data : undefined;
}

function parsePoseRetarget(frame: SincroMotionDebugFrame): PoseRetargetMetricInput | undefined {
    const solver = solverSchema.safeParse(frame.solver);
    if (!solver.success || solver.data.poseRetarget === undefined) {
        return undefined;
    }
    return solver.data.poseRetarget;
}

function parseApplied(frame: SincroMotionDebugFrame): AppliedMetricInput | undefined {
    const parsed = appliedSchema.safeParse(frame.applied);
    return parsed.success ? parsed.data : undefined;
}

function parseMetrics(frame: SincroMotionDebugFrame): z.infer<typeof metricsSchema> | undefined {
    const parsed = metricsSchema.safeParse(frame.metrics);
    return parsed.success ? parsed.data : undefined;
}

function parseTemporal(frame: SincroMotionDebugFrame): TemporalUpperBodyState | undefined {
    const parsed = parseTemporalUpperBodyState(frame.temporal);
    return parsed.ok ? parsed.state : undefined;
}

function parsePhase6Solver(
    frame: SincroMotionDebugFrame,
): MotionDebugPhase6SolverSnapshot | undefined {
    if (!isRecord(frame.solver)) {
        return undefined;
    }
    const parsed = parseMotionDebugPhase6SolverSnapshot(frame.solver.phase6);
    return parsed.ok ? parsed.snapshot : undefined;
}

function parseFinalPose(frame: SincroMotionDebugFrame): MotionDebugFinalPoseSnapshot | undefined {
    const parsed = parseMotionDebugFinalPoseSnapshot(frame.finalPose);
    return parsed.ok ? parsed.snapshot : undefined;
}

function parseIntent(frame: SincroMotionDebugFrame): ParsedIntentFrame {
    if (frame.intent === undefined) {
        return { status: "missing" };
    }
    const parsed = parseMotionIntentState(frame.intent);
    if (!parsed.ok) {
        return { status: "invalid" };
    }
    return { status: "valid", intent: parsed.state };
}

function resolveThresholds(
    config: MotionMetricConfig,
): Record<MotionMetricKey, MotionMetricThreshold> {
    return {
        neutralJitter:
            config.thresholds?.neutralJitter ?? DEFAULT_MOTION_METRIC_THRESHOLDS.neutralJitter,
        elbowFlipCount:
            config.thresholds?.elbowFlipCount ?? DEFAULT_MOTION_METRIC_THRESHOLDS.elbowFlipCount,
        recoveryJumpAngleDeg:
            config.thresholds?.recoveryJumpAngleDeg ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.recoveryJumpAngleDeg,
        angularVelocitySpikeCount:
            config.thresholds?.angularVelocitySpikeCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.angularVelocitySpikeCount,
        reachClampOccupancy:
            config.thresholds?.reachClampOccupancy ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.reachClampOccupancy,
        trackingLossDurationMs:
            config.thresholds?.trackingLossDurationMs ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.trackingLossDurationMs,
        sideSwapCount:
            config.thresholds?.sideSwapCount ?? DEFAULT_MOTION_METRIC_THRESHOLDS.sideSwapCount,
        addedLatencyMs:
            config.thresholds?.addedLatencyMs ?? DEFAULT_MOTION_METRIC_THRESHOLDS.addedLatencyMs,
        temporalPredictedArmFrameCount:
            config.thresholds?.temporalPredictedArmFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalPredictedArmFrameCount,
        temporalRecoveringArmFrameCount:
            config.thresholds?.temporalRecoveringArmFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalRecoveringArmFrameCount,
        temporalLostArmDurationMs:
            config.thresholds?.temporalLostArmDurationMs ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalLostArmDurationMs,
        temporalMaxRecoveryJumpDegEquivalent:
            config.thresholds?.temporalMaxRecoveryJumpDegEquivalent ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalMaxRecoveryJumpDegEquivalent,
        temporalNeutralWristJitter:
            config.thresholds?.temporalNeutralWristJitter ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.temporalNeutralWristJitter,
        solverElbowFlipRejectCount:
            config.thresholds?.solverElbowFlipRejectCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.solverElbowFlipRejectCount,
        solverReachClampOccupancy:
            config.thresholds?.solverReachClampOccupancy ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.solverReachClampOccupancy,
        solverPoleUncertainFrameCount:
            config.thresholds?.solverPoleUncertainFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.solverPoleUncertainFrameCount,
        finalPoseAngularVelocityClampCount:
            config.thresholds?.finalPoseAngularVelocityClampCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.finalPoseAngularVelocityClampCount,
        finalPoseOwnedBoneConflictCount:
            config.thresholds?.finalPoseOwnedBoneConflictCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.finalPoseOwnedBoneConflictCount,
        gestureFlickerCount:
            config.thresholds?.gestureFlickerCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.gestureFlickerCount,
        semanticFallbackFrameCount:
            config.thresholds?.semanticFallbackFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.semanticFallbackFrameCount,
        intentCooldownSuppressionCount:
            config.thresholds?.intentCooldownSuppressionCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.intentCooldownSuppressionCount,
        intentInvalidFrameCount:
            config.thresholds?.intentInvalidFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.intentInvalidFrameCount,
        trackerBudgetOverrunFrameCount:
            config.thresholds?.trackerBudgetOverrunFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.trackerBudgetOverrunFrameCount,
        trackerDroppedFrameCount:
            config.thresholds?.trackerDroppedFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.trackerDroppedFrameCount,
        degradationStageFrameCount:
            config.thresholds?.degradationStageFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.degradationStageFrameCount,
        degradationRecoveryFrameCount:
            config.thresholds?.degradationRecoveryFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.degradationRecoveryFrameCount,
        roiPausedFrameCount:
            config.thresholds?.roiPausedFrameCount ??
            DEFAULT_MOTION_METRIC_THRESHOLDS.roiPausedFrameCount,
    };
}

function statusForValue(
    value: number,
    threshold: MotionMetricThreshold,
    direction: MotionMetricDirection,
): MotionMetricSeverity {
    if (direction === "lower_is_better") {
        if (value <= threshold.pass) {
            return "pass";
        }
        if (value <= threshold.warn) {
            return "warn";
        }
        return "fail";
    }

    if (value >= threshold.pass) {
        return "pass";
    }
    if (value >= threshold.warn) {
        return "warn";
    }
    return "fail";
}

function createMetricResult(
    key: MotionMetricKey,
    threshold: MotionMetricThreshold,
    computation: NumericMetricComputation,
): MotionMetricResult {
    const definition = METRIC_DEFINITIONS[key];
    if (!computation.ok) {
        return {
            key,
            value: null,
            unit: definition.unit,
            status: "not_available",
            severity: "warn",
            direction: definition.direction,
            threshold,
            sampleCount: computation.sampleCount,
            unavailableReason: computation.reason,
        };
    }

    const severity = statusForValue(computation.value, threshold, definition.direction);
    return {
        key,
        value: computation.value,
        unit: definition.unit,
        status: severity,
        severity,
        direction: definition.direction,
        threshold,
        sampleCount: computation.sampleCount,
    };
}

function maxSeverity(results: Record<MotionMetricKey, MotionMetricResult>): MotionMetricSeverity {
    if (MOTION_METRIC_KEYS.some((key) => results[key].severity === "fail")) {
        return "fail";
    }
    if (MOTION_METRIC_KEYS.some((key) => results[key].severity === "warn")) {
        return "warn";
    }
    return "pass";
}

function calculateDurationMs(frames: readonly SincroMotionDebugFrame[]): number {
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (first === undefined || last === undefined) {
        return 0;
    }
    return Math.max(0, last.timestamp.mediaTimeMs - first.timestamp.mediaTimeMs);
}

function isTrackingLost(snapshot: PoseSnapshotMetricInput): boolean {
    return (
        snapshot.detected === false ||
        snapshot.degradedToFaceOnly === true ||
        (snapshot.consecutiveFailures ?? 0) > 0
    );
}

function calculateNeutralJitter(
    frames: readonly SincroMotionDebugFrame[],
    fixtureId: MotionP0FixtureId | undefined,
): NumericMetricComputation {
    if (fixtureId !== "neutral-10s") {
        return {
            ok: false,
            reason: "neutralJitter requires fixtureId neutral-10s.",
            sampleCount: 0,
        };
    }

    const leftSamples: { x: number; y: number }[] = [];
    const rightSamples: { x: number; y: number }[] = [];
    for (const frame of frames) {
        const snapshot = parsePoseSnapshot(frame);
        if (snapshot === undefined) {
            continue;
        }
        leftSamples.push({
            x: snapshot.leftArm.targets.wrist.cameraX - snapshot.upperBody.shoulderCenterX,
            y: snapshot.leftArm.targets.wrist.cameraY - snapshot.upperBody.shoulderCenterY,
        });
        rightSamples.push({
            x: snapshot.rightArm.targets.wrist.cameraX - snapshot.upperBody.shoulderCenterX,
            y: snapshot.rightArm.targets.wrist.cameraY - snapshot.upperBody.shoulderCenterY,
        });
    }

    if (leftSamples.length < 30 || rightSamples.length < 30) {
        return {
            ok: false,
            reason: "neutralJitter requires at least 30 valid pose samples.",
            sampleCount: Math.min(leftSamples.length, rightSamples.length),
        };
    }

    return {
        ok: true,
        value: Math.max(calculateRmsDistance(leftSamples), calculateRmsDistance(rightSamples)),
        sampleCount: Math.min(leftSamples.length, rightSamples.length),
    };
}

function calculateRmsDistance(samples: readonly { x: number; y: number }[]): number {
    const mean = samples.reduce(
        (accumulator, sample) => ({
            x: accumulator.x + sample.x / samples.length,
            y: accumulator.y + sample.y / samples.length,
        }),
        { x: 0, y: 0 },
    );
    const squaredSum = samples.reduce((sum, sample) => {
        const dx = sample.x - mean.x;
        const dy = sample.y - mean.y;
        return sum + dx * dx + dy * dy;
    }, 0);
    return Math.sqrt(squaredSum / samples.length);
}

function calculateElbowFlipCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const retarget = parsePoseRetarget(frame);
        if (retarget === undefined) {
            continue;
        }
        sampleCount += 1;
        if (
            hasElbowFlipReason(retarget.leftArm.constraint?.reasons ?? []) ||
            hasElbowFlipReason(retarget.rightArm.constraint?.reasons ?? [])
        ) {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "elbowFlipCount requires frame.solver.poseRetarget.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function hasElbowFlipReason(reasons: readonly string[]): boolean {
    return reasons.includes("elbow_pole_stabilized") || reasons.includes("elbow_flip");
}

function calculateReachClampOccupancy(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let occupiedCount = 0;
    for (const frame of frames) {
        const retarget = parsePoseRetarget(frame);
        if (retarget === undefined) {
            continue;
        }
        sampleCount += 1;
        if (isArmReachClamped(retarget.leftArm) || isArmReachClamped(retarget.rightArm)) {
            occupiedCount += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "reachClampOccupancy requires frame.solver.poseRetarget.",
            sampleCount,
        };
    }
    return { ok: true, value: occupiedCount / sampleCount, sampleCount };
}

function isArmReachClamped(arm: PoseRetargetMetricInput["leftArm"]): boolean {
    return arm.constraint?.jointLimited === true || (arm.constraint?.targetPushDistance ?? 0) > 0;
}

function calculateTrackingLossDurationMs(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let durationMs = 0;
    let previous: { mediaTimeMs: number; lost: boolean } | undefined;
    for (const frame of frames) {
        const snapshot = parsePoseSnapshot(frame);
        if (snapshot === undefined) {
            continue;
        }
        sampleCount += 1;
        if (previous?.lost) {
            durationMs += Math.max(0, frame.timestamp.mediaTimeMs - previous.mediaTimeMs);
        }
        previous = {
            mediaTimeMs: frame.timestamp.mediaTimeMs,
            lost: isTrackingLost(snapshot),
        };
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "trackingLossDurationMs requires frame.poseSnapshot.",
            sampleCount,
        };
    }
    return { ok: true, value: durationMs, sampleCount };
}

function calculateSideSwapCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    let previousOrder: -1 | 0 | 1 | undefined;
    for (const frame of frames) {
        const snapshot = parsePoseSnapshot(frame);
        if (snapshot === undefined) {
            continue;
        }
        const leftConfidence = snapshot.leftArm.targets.wrist.confidence;
        const rightConfidence = snapshot.rightArm.targets.wrist.confidence;
        if (leftConfidence === undefined || rightConfidence === undefined) {
            continue;
        }
        sampleCount += 1;
        if (leftConfidence <= 0.5 || rightConfidence <= 0.5) {
            continue;
        }
        const order = compareScreenOrder(
            snapshot.leftArm.targets.wrist.cameraX,
            snapshot.rightArm.targets.wrist.cameraX,
        );
        if (
            previousOrder !== undefined &&
            previousOrder !== 0 &&
            order !== 0 &&
            previousOrder !== order
        ) {
            count += 1;
        }
        previousOrder = order;
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "sideSwapCount requires pose wrist cameraX and confidence inputs.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function compareScreenOrder(leftX: number, rightX: number): -1 | 0 | 1 {
    if (leftX < rightX) {
        return -1;
    }
    if (leftX > rightX) {
        return 1;
    }
    return 0;
}

function calculateAddedLatencyMs(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    const samples: number[] = [];
    for (const frame of frames) {
        const metrics = parseMetrics(frame);
        const roundTripMs = metrics?.tracker?.workerRoundTripMs;
        if (roundTripMs !== undefined) {
            samples.push(roundTripMs);
        }
    }
    if (samples.length === 0) {
        return {
            ok: false,
            reason: "addedLatencyMs requires frame.metrics.tracker.workerRoundTripMs.",
            sampleCount: 0,
        };
    }
    return { ok: true, value: percentile(samples, 0.95), sampleCount: samples.length };
}

function trackerMetricsRecord(frame: SincroMotionDebugFrame): Record<string, unknown> | undefined {
    if (!isRecord(frame.metrics) || !isRecord(frame.metrics.tracker)) {
        return undefined;
    }
    return frame.metrics.tracker;
}

function parseTrackerBudgetStatus(
    frame: SincroMotionDebugFrame,
): z.infer<typeof trackerBudgetStatusSchema> | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.budget)) {
        return undefined;
    }
    const parsed = trackerBudgetStatusSchema.safeParse(tracker.budget.budgetStatus);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerDroppedFrames(frame: SincroMotionDebugFrame): number | undefined {
    const tracker = trackerMetricsRecord(frame);
    const parsed = trackerDroppedFramesSchema.safeParse(tracker?.droppedFrames);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerDegradationStage(
    frame: SincroMotionDebugFrame,
): z.infer<typeof trackerDegradationStageSchema> | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.degradationPolicy)) {
        return undefined;
    }
    const parsed = trackerDegradationStageSchema.safeParse(tracker.degradationPolicy.stage);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerLegacyDegradationState(frame: SincroMotionDebugFrame): string | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.budget) || !isRecord(tracker.budget.degradation)) {
        return undefined;
    }
    const parsed = z.string().safeParse(tracker.budget.degradation.state);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerDegradationRecovering(frame: SincroMotionDebugFrame): boolean | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.degradationPolicy)) {
        return undefined;
    }
    const parsed = z.boolean().safeParse(tracker.degradationPolicy.recovering);
    return parsed.success ? parsed.data : undefined;
}

function parseTrackerRoiPauseState(
    frame: SincroMotionDebugFrame,
): z.infer<typeof trackerRoiPauseStateSchema> | undefined {
    const tracker = trackerMetricsRecord(frame);
    if (!isRecord(tracker?.roi)) {
        return undefined;
    }
    const parsed = trackerRoiPauseStateSchema.safeParse(tracker.roi.pauseState);
    return parsed.success ? parsed.data : undefined;
}

function calculateTrackerBudgetOverrunFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const budgetStatus = parseTrackerBudgetStatus(frame);
        if (budgetStatus === undefined) {
            continue;
        }
        sampleCount += 1;
        if (budgetStatus === "over_budget") {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "trackerBudgetOverrunFrameCount requires frame.metrics.tracker.budget.budgetStatus.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateTrackerDroppedFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    let previousTrackerDroppedFrames: number | undefined;
    for (const frame of frames) {
        const timestampDroppedFrames = frame.timestamp.droppedPresentedFrames;
        const trackerDroppedFrames = parseTrackerDroppedFrames(frame);
        let trackerDroppedFrameDelta: number | undefined;
        if (trackerDroppedFrames !== undefined) {
            trackerDroppedFrameDelta =
                previousTrackerDroppedFrames === undefined
                    ? 0
                    : Math.max(0, trackerDroppedFrames - previousTrackerDroppedFrames);
            previousTrackerDroppedFrames = trackerDroppedFrames;
        }
        if (timestampDroppedFrames === undefined && trackerDroppedFrameDelta === undefined) {
            continue;
        }
        sampleCount += 1;
        count += Math.max(timestampDroppedFrames ?? 0, trackerDroppedFrameDelta ?? 0);
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "trackerDroppedFrameCount requires frame.timestamp.droppedPresentedFrames or frame.metrics.tracker.droppedFrames.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateDegradationStageFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const policyStage = parseTrackerDegradationStage(frame);
        const legacyState = parseTrackerLegacyDegradationState(frame);
        if (policyStage === undefined && legacyState === undefined) {
            continue;
        }
        sampleCount += 1;
        if (
            (policyStage !== undefined && policyStage !== "full") ||
            (legacyState !== undefined && legacyState !== "full")
        ) {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "degradationStageFrameCount requires frame.metrics.tracker.degradationPolicy.stage or frame.metrics.tracker.budget.degradation.state.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateDegradationRecoveryFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const recovering = parseTrackerDegradationRecovering(frame);
        if (recovering === undefined) {
            continue;
        }
        sampleCount += 1;
        if (recovering) {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "degradationRecoveryFrameCount requires frame.metrics.tracker.degradationPolicy.recovering.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateRoiPausedFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const pauseState = parseTrackerRoiPauseState(frame);
        if (pauseState === undefined) {
            continue;
        }
        sampleCount += 1;
        if (pauseState !== "active") {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "roiPausedFrameCount requires frame.metrics.tracker.roi.pauseState.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function percentile(samples: readonly number[], percentileValue: number): number {
    const sorted = [...samples].sort((left, right) => left - right);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
    );
    return sorted[index] ?? 0;
}

function calculateAngularVelocitySpikeCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let spikeCount = 0;
    for (const frame of frames) {
        const applied = parseApplied(frame);
        if (applied === undefined) {
            continue;
        }
        const values = angularVelocityValues(applied);
        sampleCount += values.length;
        spikeCount += values.filter((value) => value > 720).length;
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "angularVelocitySpikeCount requires frame.applied.angularVelocityDegPerSec.",
            sampleCount,
        };
    }
    return { ok: true, value: spikeCount, sampleCount };
}

function angularVelocityValues(applied: AppliedMetricInput): number[] {
    if (typeof applied.angularVelocityDegPerSec === "number") {
        return [applied.angularVelocityDegPerSec];
    }
    return Object.values(applied.angularVelocityDegPerSec);
}

function calculateRecoveryJumpAngleDeg(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    const recoveryStartTimes = recoveryEventStartTimes(frames);
    if (recoveryStartTimes.length === 0) {
        return {
            ok: false,
            reason: "recoveryJumpAngleDeg requires at least one recovery event.",
            sampleCount: 0,
        };
    }

    const applied = calculateRecoveryJumpFromApplied(frames, recoveryStartTimes);
    if (applied.sampleCount > 0) {
        return applied;
    }

    const quaternion = calculateRecoveryJumpFromQuaternions(frames, recoveryStartTimes);
    if (quaternion.sampleCount > 0) {
        return quaternion;
    }

    return {
        ok: false,
        reason: "recoveryJumpAngleDeg requires applied angularVelocityDegPerSec or poseRetarget quaternions.",
        sampleCount: 0,
    };
}

function recoveryEventStartTimes(frames: readonly SincroMotionDebugFrame[]): number[] {
    const startTimes: number[] = [];
    let previousLost = false;
    let hasPreviousPose = false;
    for (const frame of frames) {
        const snapshot = parsePoseSnapshot(frame);
        if (snapshot === undefined) {
            continue;
        }
        const lost = isTrackingLost(snapshot);
        const recovered =
            hasPreviousPose &&
            previousLost &&
            snapshot.detected === true &&
            snapshot.degradedToFaceOnly !== true &&
            (snapshot.consecutiveFailures ?? 0) === 0;
        if (recovered) {
            startTimes.push(frame.timestamp.mediaTimeMs);
        }
        previousLost = lost;
        hasPreviousPose = true;
    }
    return startTimes;
}

function calculateRecoveryJumpFromApplied(
    frames: readonly SincroMotionDebugFrame[],
    recoveryStartTimes: readonly number[],
): NumericMetricComputation {
    let sampleCount = 0;
    let maxAngleDeg = 0;
    for (const frame of frames) {
        if (!isInAnyRecoveryWindow(frame.timestamp.mediaTimeMs, recoveryStartTimes)) {
            continue;
        }
        const applied = parseApplied(frame);
        if (applied === undefined) {
            continue;
        }
        const values = angularVelocityValues(applied);
        sampleCount += values.length;
        for (const value of values) {
            maxAngleDeg = Math.max(maxAngleDeg, value / 60);
        }
    }
    return { ok: true, value: maxAngleDeg, sampleCount };
}

function calculateRecoveryJumpFromQuaternions(
    frames: readonly SincroMotionDebugFrame[],
    recoveryStartTimes: readonly number[],
): NumericMetricComputation {
    let sampleCount = 0;
    let maxAngleDeg = 0;
    let previous:
        | {
              mediaTimeMs: number;
              quaternions: QuaternionMetricInput[];
          }
        | undefined;

    for (const frame of frames) {
        const quaternions = retargetQuaternions(frame);
        if (quaternions.length === 0) {
            continue;
        }
        if (
            previous !== undefined &&
            isInAnyRecoveryWindow(frame.timestamp.mediaTimeMs, recoveryStartTimes)
        ) {
            const deltaMs = frame.timestamp.mediaTimeMs - previous.mediaTimeMs;
            if (deltaMs > 0) {
                const pairCount = Math.min(previous.quaternions.length, quaternions.length);
                for (let index = 0; index < pairCount; index += 1) {
                    const previousQuaternion = previous.quaternions[index];
                    const currentQuaternion = quaternions[index];
                    if (previousQuaternion === undefined || currentQuaternion === undefined) {
                        continue;
                    }
                    const frameAngleDeg =
                        (quaternionAngleDeg(previousQuaternion, currentQuaternion) * 1000) /
                        deltaMs /
                        60;
                    maxAngleDeg = Math.max(maxAngleDeg, frameAngleDeg);
                    sampleCount += 1;
                }
            }
        }
        previous = {
            mediaTimeMs: frame.timestamp.mediaTimeMs,
            quaternions,
        };
    }

    return { ok: true, value: maxAngleDeg, sampleCount };
}

function isInAnyRecoveryWindow(mediaTimeMs: number, startTimes: readonly number[]): boolean {
    return startTimes.some(
        (startTimeMs) => startTimeMs <= mediaTimeMs && mediaTimeMs < startTimeMs + 500,
    );
}

function retargetQuaternions(frame: SincroMotionDebugFrame): QuaternionMetricInput[] {
    const retarget = parsePoseRetarget(frame);
    if (retarget === undefined) {
        return [];
    }
    return [
        retarget.leftArm.upperArmQuaternion,
        retarget.leftArm.lowerArmQuaternion,
        retarget.rightArm.upperArmQuaternion,
        retarget.rightArm.lowerArmQuaternion,
    ].filter((quaternion): quaternion is QuaternionMetricInput => quaternion !== undefined);
}

function quaternionAngleDeg(
    previousQuaternion: QuaternionMetricInput,
    currentQuaternion: QuaternionMetricInput,
): number {
    return (
        new Quaternion(
            previousQuaternion.x,
            previousQuaternion.y,
            previousQuaternion.z,
            previousQuaternion.w,
        ).angleTo(
            new Quaternion(
                currentQuaternion.x,
                currentQuaternion.y,
                currentQuaternion.z,
                currentQuaternion.w,
            ),
        ) *
        (180 / Math.PI)
    );
}

type ArmSide = "left" | "right";

const ARM_SIDES: ArmSide[] = ["left", "right"];

function calculateTemporalArmStateCount(
    frames: readonly SincroMotionDebugFrame[],
    state: "predicted" | "recovering",
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const temporal = parseTemporal(frame);
        if (temporal === undefined) {
            continue;
        }
        for (const side of ARM_SIDES) {
            sampleCount += 1;
            if (temporal.arms[side].state === state) {
                count += 1;
            }
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: `temporal ${state} arm-frame count requires frame.temporal.`,
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateTemporalLostArmDurationMs(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let durationMs = 0;
    let previous:
        | {
              frameMediaTimeMs: number;
              temporal: TemporalUpperBodyState;
          }
        | undefined;
    for (const frame of frames) {
        const temporal = parseTemporal(frame);
        if (temporal === undefined) {
            continue;
        }
        sampleCount += 1;
        if (previous !== undefined) {
            const dtMs = clamp(frame.timestamp.mediaTimeMs - previous.frameMediaTimeMs, 0, 250);
            for (const side of ARM_SIDES) {
                if (previous.temporal.arms[side].state === "lost") {
                    durationMs += dtMs;
                }
            }
        }
        previous = {
            frameMediaTimeMs: frame.timestamp.mediaTimeMs,
            temporal,
        };
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "temporalLostArmDurationMs requires frame.temporal.",
            sampleCount,
        };
    }
    return { ok: true, value: durationMs, sampleCount };
}

function calculateTemporalMaxRecoveryJumpDegEquivalent(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let maxJumpDeg = 0;
    let previous: TemporalUpperBodyState | undefined;
    for (const frame of frames) {
        const temporal = parseTemporal(frame);
        if (temporal === undefined) {
            continue;
        }
        if (previous !== undefined) {
            for (const side of ARM_SIDES) {
                const currentArm = temporal.arms[side];
                const previousArm = previous.arms[side];
                if (currentArm.state !== "recovering") {
                    continue;
                }
                sampleCount += 1;
                maxJumpDeg = Math.max(
                    maxJumpDeg,
                    temporalArmScalarJumpDegEquivalent(previousArm, currentArm),
                );
            }
        }
        previous = temporal;
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "temporalMaxRecoveryJumpDegEquivalent requires consecutive recovering temporal arm samples.",
            sampleCount,
        };
    }
    return { ok: true, value: maxJumpDeg, sampleCount };
}

function temporalArmScalarJumpDegEquivalent(
    previous: TemporalArmState,
    current: TemporalArmState,
): number {
    return Math.max(
        Math.abs(current.elevationRad - previous.elevationRad) * (180 / Math.PI),
        Math.abs(current.elbowFlexionRad - previous.elbowFlexionRad) * (180 / Math.PI),
        Math.abs(current.reach - previous.reach) * 90,
        Math.abs(current.forwardness - previous.forwardness) * 90,
        Math.abs(current.openness - previous.openness) * 45,
    );
}

function calculateTemporalNeutralWristJitter(
    frames: readonly SincroMotionDebugFrame[],
    fixtureId: MotionP0FixtureId | undefined,
): NumericMetricComputation {
    if (fixtureId !== "neutral-10s") {
        return {
            ok: false,
            reason: "temporalNeutralWristJitter requires fixtureId neutral-10s.",
            sampleCount: 0,
        };
    }

    const samples: Record<ArmSide, TemporalTuple3[]> = {
        left: [],
        right: [],
    };
    for (const frame of frames) {
        const temporal = parseTemporal(frame);
        if (temporal === undefined) {
            continue;
        }
        for (const side of ARM_SIDES) {
            const arm = temporal.arms[side];
            if (
                (arm.state === "tracked" || arm.state === "suspect") &&
                arm.bodyLocalWrist !== undefined
            ) {
                samples[side].push(arm.bodyLocalWrist);
            }
        }
    }

    const sampleCount = samples.left.length + samples.right.length;
    if (sampleCount < 2) {
        return {
            ok: false,
            reason: "temporalNeutralWristJitter requires at least 2 temporal wrist samples.",
            sampleCount,
        };
    }

    const squaredDistances: number[] = [];
    for (const side of ARM_SIDES) {
        const sideSamples = samples[side];
        for (let index = 1; index < sideSamples.length; index += 1) {
            const previous = sideSamples[index - 1];
            const current = sideSamples[index];
            if (previous === undefined || current === undefined) {
                continue;
            }
            squaredDistances.push(squaredTupleDistance(previous, current));
        }
    }
    if (squaredDistances.length === 0) {
        return {
            ok: false,
            reason: "temporalNeutralWristJitter requires consecutive temporal wrist samples.",
            sampleCount,
        };
    }

    return {
        ok: true,
        value: Math.sqrt(
            squaredDistances.reduce((sum, distance) => sum + distance, 0) / squaredDistances.length,
        ),
        sampleCount,
    };
}

function calculateSolverElbowFlipRejectCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const phase6 = parsePhase6Solver(frame);
        if (phase6 === undefined) {
            continue;
        }
        for (const side of ARM_SIDES) {
            const ik = phase6.arms[side].ik;
            if (ik === undefined) {
                continue;
            }
            sampleCount += 1;
            if (ik.constraintReasonCodes.includes("pole_flip_rejected")) {
                count += 1;
            }
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "solverElbowFlipRejectCount requires frame.solver.phase6 arm ik snapshots.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateSolverReachClampOccupancy(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const phase6 = parsePhase6Solver(frame);
        if (phase6 === undefined) {
            continue;
        }
        for (const side of ARM_SIDES) {
            const ik = phase6.arms[side].ik;
            if (ik === undefined) {
                continue;
            }
            sampleCount += 1;
            if (ik.targetClamped) {
                count += 1;
            }
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "solverReachClampOccupancy requires frame.solver.phase6 arm ik snapshots.",
            sampleCount,
        };
    }
    return { ok: true, value: count / sampleCount, sampleCount };
}

function calculateSolverPoleUncertainFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const phase6 = parsePhase6Solver(frame);
        if (phase6 === undefined) {
            continue;
        }
        for (const side of ARM_SIDES) {
            const ik = phase6.arms[side].ik;
            if (ik === undefined) {
                continue;
            }
            sampleCount += 1;
            if (ik.poleState === "uncertain") {
                count += 1;
            }
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "solverPoleUncertainFrameCount requires frame.solver.phase6 arm ik snapshots.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateFinalPoseAngularVelocityClampCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const finalPose = parseFinalPose(frame);
        if (finalPose === undefined) {
            continue;
        }
        sampleCount += finalPose.ownedBones.length;
        for (const clamped of finalPose.clampedBones) {
            if (clamped.reason === "angular_velocity") {
                count += 1;
            }
        }
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "finalPoseAngularVelocityClampCount requires frame.finalPose.clampedBones.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateFinalPoseOwnedBoneConflictCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const finalPose = parseFinalPose(frame);
        if (finalPose === undefined) {
            continue;
        }
        sampleCount += finalPose.ownedBones.length;
        count += finalPose.warnings.filter((warning) =>
            warning.startsWith("owned_bone_conflict:"),
        ).length;
    }
    if (sampleCount === 0) {
        return {
            ok: false,
            reason: "finalPoseOwnedBoneConflictCount requires frame.finalPose.warnings.",
            sampleCount,
        };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateIntentInvalidFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const intent = parseIntent(frame);
        if (intent.status === "missing") {
            continue;
        }
        sampleCount += 1;
        if (intent.status === "invalid") {
            count += 1;
        }
    }
    if (sampleCount === 0) {
        return { ok: false, reason: "intent_not_recorded", sampleCount };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateGestureFlickerCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    const previous: Partial<Record<ArmSide, MotionIntentSideState>> = {};
    for (const frame of frames) {
        const parsed = parseIntent(frame);
        if (parsed.status !== "valid") {
            continue;
        }
        for (const side of ARM_SIDES) {
            const current = parsed.intent.arms[side];
            const previousSide = previous[side];
            sampleCount += 1;
            if (
                previousSide !== undefined &&
                isSemanticIntent(previousSide.intent) &&
                previousSide.stableDurationMs < 150 &&
                (current.intent === "tracking" ||
                    (isSemanticIntent(current.intent) && current.intent !== previousSide.intent))
            ) {
                count += 1;
            }
            previous[side] = current;
        }
    }
    if (sampleCount === 0) {
        return { ok: false, reason: "intent_not_recorded", sampleCount };
    }
    return { ok: true, value: count, sampleCount };
}

function calculateSemanticFallbackFrameCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    return calculateIntentSideSampleCount(frames, (side) =>
        side.intent === "lost" || side.intent === "fallback" ? 1 : 0,
    );
}

function calculateIntentCooldownSuppressionCount(
    frames: readonly SincroMotionDebugFrame[],
): NumericMetricComputation {
    return calculateIntentSideSampleCount(frames, (side) =>
        side.warnings.includes("gesture_cooldown") ? 1 : 0,
    );
}

function calculateIntentSideSampleCount(
    frames: readonly SincroMotionDebugFrame[],
    countForSide: (side: MotionIntentSideState) => number,
): NumericMetricComputation {
    let sampleCount = 0;
    let count = 0;
    for (const frame of frames) {
        const parsed = parseIntent(frame);
        if (parsed.status !== "valid") {
            continue;
        }
        for (const side of ARM_SIDES) {
            sampleCount += 1;
            count += countForSide(parsed.intent.arms[side]);
        }
    }
    if (sampleCount === 0) {
        return { ok: false, reason: "intent_not_recorded", sampleCount };
    }
    return { ok: true, value: count, sampleCount };
}

function isSemanticIntent(intent: ArmMotionIntent): boolean {
    return intent !== "tracking" && intent !== "lost" && intent !== "fallback";
}

function squaredTupleDistance(left: TemporalTuple3, right: TemporalTuple3): number {
    const dx = right[0] - left[0];
    const dy = right[1] - left[1];
    const dz = right[2] - left[2];
    return dx * dx + dy * dy + dz * dz;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function calculateMotionMetricSummary(
    frames: readonly SincroMotionDebugFrame[],
    config: MotionMetricConfig,
): MotionMetricSummary {
    const thresholds = resolveThresholds(config);
    const metrics: Record<MotionMetricKey, MotionMetricResult> = {
        neutralJitter: createMetricResult(
            "neutralJitter",
            thresholds.neutralJitter,
            calculateNeutralJitter(frames, config.fixtureId),
        ),
        elbowFlipCount: createMetricResult(
            "elbowFlipCount",
            thresholds.elbowFlipCount,
            calculateElbowFlipCount(frames),
        ),
        recoveryJumpAngleDeg: createMetricResult(
            "recoveryJumpAngleDeg",
            thresholds.recoveryJumpAngleDeg,
            calculateRecoveryJumpAngleDeg(frames),
        ),
        angularVelocitySpikeCount: createMetricResult(
            "angularVelocitySpikeCount",
            thresholds.angularVelocitySpikeCount,
            calculateAngularVelocitySpikeCount(frames),
        ),
        reachClampOccupancy: createMetricResult(
            "reachClampOccupancy",
            thresholds.reachClampOccupancy,
            calculateReachClampOccupancy(frames),
        ),
        trackingLossDurationMs: createMetricResult(
            "trackingLossDurationMs",
            thresholds.trackingLossDurationMs,
            calculateTrackingLossDurationMs(frames),
        ),
        sideSwapCount: createMetricResult(
            "sideSwapCount",
            thresholds.sideSwapCount,
            calculateSideSwapCount(frames),
        ),
        addedLatencyMs: createMetricResult(
            "addedLatencyMs",
            thresholds.addedLatencyMs,
            calculateAddedLatencyMs(frames),
        ),
        temporalPredictedArmFrameCount: createMetricResult(
            "temporalPredictedArmFrameCount",
            thresholds.temporalPredictedArmFrameCount,
            calculateTemporalArmStateCount(frames, "predicted"),
        ),
        temporalRecoveringArmFrameCount: createMetricResult(
            "temporalRecoveringArmFrameCount",
            thresholds.temporalRecoveringArmFrameCount,
            calculateTemporalArmStateCount(frames, "recovering"),
        ),
        temporalLostArmDurationMs: createMetricResult(
            "temporalLostArmDurationMs",
            thresholds.temporalLostArmDurationMs,
            calculateTemporalLostArmDurationMs(frames),
        ),
        temporalMaxRecoveryJumpDegEquivalent: createMetricResult(
            "temporalMaxRecoveryJumpDegEquivalent",
            thresholds.temporalMaxRecoveryJumpDegEquivalent,
            calculateTemporalMaxRecoveryJumpDegEquivalent(frames),
        ),
        temporalNeutralWristJitter: createMetricResult(
            "temporalNeutralWristJitter",
            thresholds.temporalNeutralWristJitter,
            calculateTemporalNeutralWristJitter(frames, config.fixtureId),
        ),
        solverElbowFlipRejectCount: createMetricResult(
            "solverElbowFlipRejectCount",
            thresholds.solverElbowFlipRejectCount,
            calculateSolverElbowFlipRejectCount(frames),
        ),
        solverReachClampOccupancy: createMetricResult(
            "solverReachClampOccupancy",
            thresholds.solverReachClampOccupancy,
            calculateSolverReachClampOccupancy(frames),
        ),
        solverPoleUncertainFrameCount: createMetricResult(
            "solverPoleUncertainFrameCount",
            thresholds.solverPoleUncertainFrameCount,
            calculateSolverPoleUncertainFrameCount(frames),
        ),
        finalPoseAngularVelocityClampCount: createMetricResult(
            "finalPoseAngularVelocityClampCount",
            thresholds.finalPoseAngularVelocityClampCount,
            calculateFinalPoseAngularVelocityClampCount(frames),
        ),
        finalPoseOwnedBoneConflictCount: createMetricResult(
            "finalPoseOwnedBoneConflictCount",
            thresholds.finalPoseOwnedBoneConflictCount,
            calculateFinalPoseOwnedBoneConflictCount(frames),
        ),
        gestureFlickerCount: createMetricResult(
            "gestureFlickerCount",
            thresholds.gestureFlickerCount,
            calculateGestureFlickerCount(frames),
        ),
        semanticFallbackFrameCount: createMetricResult(
            "semanticFallbackFrameCount",
            thresholds.semanticFallbackFrameCount,
            calculateSemanticFallbackFrameCount(frames),
        ),
        intentCooldownSuppressionCount: createMetricResult(
            "intentCooldownSuppressionCount",
            thresholds.intentCooldownSuppressionCount,
            calculateIntentCooldownSuppressionCount(frames),
        ),
        intentInvalidFrameCount: createMetricResult(
            "intentInvalidFrameCount",
            thresholds.intentInvalidFrameCount,
            calculateIntentInvalidFrameCount(frames),
        ),
        trackerBudgetOverrunFrameCount: createMetricResult(
            "trackerBudgetOverrunFrameCount",
            thresholds.trackerBudgetOverrunFrameCount,
            calculateTrackerBudgetOverrunFrameCount(frames),
        ),
        trackerDroppedFrameCount: createMetricResult(
            "trackerDroppedFrameCount",
            thresholds.trackerDroppedFrameCount,
            calculateTrackerDroppedFrameCount(frames),
        ),
        degradationStageFrameCount: createMetricResult(
            "degradationStageFrameCount",
            thresholds.degradationStageFrameCount,
            calculateDegradationStageFrameCount(frames),
        ),
        degradationRecoveryFrameCount: createMetricResult(
            "degradationRecoveryFrameCount",
            thresholds.degradationRecoveryFrameCount,
            calculateDegradationRecoveryFrameCount(frames),
        ),
        roiPausedFrameCount: createMetricResult(
            "roiPausedFrameCount",
            thresholds.roiPausedFrameCount,
            calculateRoiPausedFrameCount(frames),
        ),
    };

    return {
        schemaVersion: "sincro.motion-metrics.v1",
        fixtureId: config.fixtureId,
        generatedAtIso: config.generatedAtIso,
        frameCount: frames.length,
        durationMs: calculateDurationMs(frames),
        severity: maxSeverity(metrics),
        metrics,
    };
}

function severityRank(severity: MotionMetricSeverity): number {
    if (severity === "pass") {
        return 0;
    }
    if (severity === "warn") {
        return 1;
    }
    return 2;
}

function comparisonTolerance(unit: MotionMetricUnit): number {
    if (unit === "ratio") {
        return 0.01;
    }
    if (unit === "count") {
        return 0;
    }
    return 1;
}

function compareSameSeverity(
    candidate: MotionMetricResult,
    delta: number,
): MotionMetricComparison["status"] {
    const tolerance = comparisonTolerance(candidate.unit);
    if (Math.abs(delta) <= tolerance) {
        return "unchanged";
    }
    if (candidate.direction === "lower_is_better") {
        return delta < 0 ? "improved" : "regressed";
    }
    return delta > 0 ? "improved" : "regressed";
}

export function compareMotionMetricSummaries(
    baseline: MotionMetricSummary,
    candidate: MotionMetricSummary,
): Record<MotionMetricKey, MotionMetricComparison> {
    return {
        neutralJitter: compareMetric("neutralJitter", baseline, candidate),
        elbowFlipCount: compareMetric("elbowFlipCount", baseline, candidate),
        recoveryJumpAngleDeg: compareMetric("recoveryJumpAngleDeg", baseline, candidate),
        angularVelocitySpikeCount: compareMetric("angularVelocitySpikeCount", baseline, candidate),
        reachClampOccupancy: compareMetric("reachClampOccupancy", baseline, candidate),
        trackingLossDurationMs: compareMetric("trackingLossDurationMs", baseline, candidate),
        sideSwapCount: compareMetric("sideSwapCount", baseline, candidate),
        addedLatencyMs: compareMetric("addedLatencyMs", baseline, candidate),
        temporalPredictedArmFrameCount: compareMetric(
            "temporalPredictedArmFrameCount",
            baseline,
            candidate,
        ),
        temporalRecoveringArmFrameCount: compareMetric(
            "temporalRecoveringArmFrameCount",
            baseline,
            candidate,
        ),
        temporalLostArmDurationMs: compareMetric("temporalLostArmDurationMs", baseline, candidate),
        temporalMaxRecoveryJumpDegEquivalent: compareMetric(
            "temporalMaxRecoveryJumpDegEquivalent",
            baseline,
            candidate,
        ),
        temporalNeutralWristJitter: compareMetric(
            "temporalNeutralWristJitter",
            baseline,
            candidate,
        ),
        solverElbowFlipRejectCount: compareMetric(
            "solverElbowFlipRejectCount",
            baseline,
            candidate,
        ),
        solverReachClampOccupancy: compareMetric("solverReachClampOccupancy", baseline, candidate),
        solverPoleUncertainFrameCount: compareMetric(
            "solverPoleUncertainFrameCount",
            baseline,
            candidate,
        ),
        finalPoseAngularVelocityClampCount: compareMetric(
            "finalPoseAngularVelocityClampCount",
            baseline,
            candidate,
        ),
        finalPoseOwnedBoneConflictCount: compareMetric(
            "finalPoseOwnedBoneConflictCount",
            baseline,
            candidate,
        ),
        gestureFlickerCount: compareMetric("gestureFlickerCount", baseline, candidate),
        semanticFallbackFrameCount: compareMetric(
            "semanticFallbackFrameCount",
            baseline,
            candidate,
        ),
        intentCooldownSuppressionCount: compareMetric(
            "intentCooldownSuppressionCount",
            baseline,
            candidate,
        ),
        intentInvalidFrameCount: compareMetric("intentInvalidFrameCount", baseline, candidate),
        trackerBudgetOverrunFrameCount: compareMetric(
            "trackerBudgetOverrunFrameCount",
            baseline,
            candidate,
        ),
        trackerDroppedFrameCount: compareMetric("trackerDroppedFrameCount", baseline, candidate),
        degradationStageFrameCount: compareMetric(
            "degradationStageFrameCount",
            baseline,
            candidate,
        ),
        degradationRecoveryFrameCount: compareMetric(
            "degradationRecoveryFrameCount",
            baseline,
            candidate,
        ),
        roiPausedFrameCount: compareMetric("roiPausedFrameCount", baseline, candidate),
    };
}

function compareMetric(
    key: MotionMetricKey,
    baseline: MotionMetricSummary,
    candidate: MotionMetricSummary,
): MotionMetricComparison {
    const baselineMetric = baseline.metrics[key];
    const candidateMetric = candidate.metrics[key];
    const severityDelta =
        severityRank(candidateMetric.severity) - severityRank(baselineMetric.severity);
    const severityChanged = severityDelta !== 0;
    if (
        baselineMetric.status === "not_available" ||
        candidateMetric.status === "not_available" ||
        baselineMetric.value === null ||
        candidateMetric.value === null
    ) {
        return {
            key,
            status: "not_comparable",
            baselineValue: baselineMetric.value,
            candidateValue: candidateMetric.value,
            delta: null,
            severityChanged,
        };
    }

    const delta = candidateMetric.value - baselineMetric.value;
    return {
        key,
        status:
            severityDelta < 0
                ? "improved"
                : severityDelta > 0
                  ? "regressed"
                  : compareSameSeverity(candidateMetric, delta),
        baselineValue: baselineMetric.value,
        candidateValue: candidateMetric.value,
        delta,
        severityChanged,
    };
}
