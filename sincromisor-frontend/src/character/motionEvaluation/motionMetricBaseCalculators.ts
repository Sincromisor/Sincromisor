import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import {
    type PoseRetargetMetricInput,
    type PoseSnapshotMetricInput,
    parseMetrics,
    parsePoseRetarget,
    parsePoseSnapshot,
} from "./motionMetricFrameParsers";
import type { MotionP0FixtureId, NumericMetricComputation } from "./motionMetricTypes";

// base metrics は pose / legacy retarget / worker latency だけを読む metric group。
// 保存 schema の検証、temporal / tracker / solver / intent 固有 metric、summary 化は非対象。
function isTrackingLost(snapshot: PoseSnapshotMetricInput): boolean {
    return (
        snapshot.detected === false ||
        snapshot.degradedToFaceOnly === true ||
        (snapshot.consecutiveFailures ?? 0) > 0
    );
}

export function calculateNeutralJitter(
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

export function calculateElbowFlipCount(
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

export function calculateReachClampOccupancy(
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

export function calculateTrackingLossDurationMs(
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

export function calculateSideSwapCount(
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

export function calculateAddedLatencyMs(
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

function percentile(samples: readonly number[], percentileValue: number): number {
    const sorted = [...samples].sort((left, right) => left - right);
    const index = Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil(sorted.length * percentileValue) - 1),
    );
    return sorted[index] ?? 0;
}
