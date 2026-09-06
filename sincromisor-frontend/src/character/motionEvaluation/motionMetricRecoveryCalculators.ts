/**
 * 追跡回復時の角度変化を、保存済みの適用角速度または姿勢変換の回転から計算する。
 * 実行中の姿勢やVRM本体は参照しない。
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

/** 追跡回復後500msの最大角度を返す。適用済み角速度を優先し、なければ回転差で補う。 */
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

/** 有効な回転を持つ前回フレームを保持し、回復区間内かつ時間が進んだ対だけを数える。 */
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
                const jump = quaternionPairJump(previous.quaternions, quaternions, deltaMs);
                maxAngleDeg = Math.max(maxAngleDeg, jump.value);
                sampleCount += jump.sampleCount;
            }
        }
        previous = {
            mediaTimeMs: frame.timestamp.mediaTimeMs,
            quaternions,
        };
    }

    return { ok: true, value: maxAngleDeg, sampleCount };
}

/** 同じ配列位置の回転差を60fps相当の角度へ換算する。時間差は呼び出し元で正と確認する。 */
function quaternionPairJump(
    previous: readonly QuaternionMetricInput[],
    current: readonly QuaternionMetricInput[],
    deltaMs: number,
): { value: number; sampleCount: number } {
    let value = 0;
    let sampleCount = 0;
    for (let index = 0; index < Math.min(previous.length, current.length); index += 1) {
        const before = previous[index];
        const after = current[index];
        if (before === undefined || after === undefined) {
            continue;
        }
        value = Math.max(value, (quaternionAngleDeg(before, after) * 1000) / deltaMs / 60);
        sampleCount += 1;
    }
    return { value, sampleCount };
}

function isInAnyRecoveryWindow(mediaTimeMs: number, startTimes: readonly number[]): boolean {
    return startTimes.some(
        (startTimeMs) => startTimeMs <= mediaTimeMs && mediaTimeMs < startTimeMs + 500,
    );
}

/** 保存済み姿勢変換から左上腕・左前腕・右上腕・右前腕の順に取り出し、欠損を除く。 */
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
