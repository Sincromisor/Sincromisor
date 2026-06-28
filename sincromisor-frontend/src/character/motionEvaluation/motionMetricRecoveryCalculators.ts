/**
 * temporal recovery / final pose の jump angle を測る calculator。
 * quaternion 差分は保存済み final pose layer から読むだけで、runtime pose や VRM object は参照しない。
 */
import { Quaternion } from "three/src/math/Quaternion.js";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import {
    type AppliedMetricInput,
    type PoseSnapshotMetricInput,
    parseApplied,
    parsePoseRetarget,
    parsePoseSnapshot,
    type QuaternionMetricInput,
} from "./motionMetricFrameParsers";
import type { NumericMetricComputation } from "./motionMetricTypes";

// recovery jump は pose recovery window と applied / retarget quaternion をまたぐ temporal 補助 metric。
// temporal arm state の集計、solver Phase 6 / final pose、summary / comparison はこの module では扱わない。
function angularVelocityValues(applied: AppliedMetricInput): number[] {
    if (typeof applied.angularVelocityDegPerSec === "number") {
        return [applied.angularVelocityDegPerSec];
    }
    return Object.values(applied.angularVelocityDegPerSec);
}

export function calculateRecoveryJumpAngleDeg(
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

function isTrackingLost(snapshot: PoseSnapshotMetricInput): boolean {
    return (
        snapshot.detected === false ||
        snapshot.degradedToFaceOnly === true ||
        (snapshot.consecutiveFailures ?? 0) > 0
    );
}
