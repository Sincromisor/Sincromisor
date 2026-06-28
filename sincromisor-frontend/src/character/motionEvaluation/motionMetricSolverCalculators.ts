import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import {
    type AppliedMetricInput,
    parseApplied,
    parseFinalPose,
    parsePhase6Solver,
} from "./motionMetricFrameParsers";
import type { NumericMetricComputation } from "./motionMetricTypes";

type ArmSide = "left" | "right";
const ARM_SIDES: ArmSide[] = ["left", "right"];

// solver metrics は angular velocity、Phase 6 solver、final pose の保存値を読む metric group。
// tracker degradation、temporal recovery、intent semantic 判定、summary / comparison はこの module では扱わない。
export function calculateAngularVelocitySpikeCount(
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

export function calculateSolverElbowFlipRejectCount(
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

export function calculateSolverReachClampOccupancy(
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

export function calculateSolverPoleUncertainFrameCount(
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

export function calculateFinalPoseAngularVelocityClampCount(
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

export function calculateFinalPoseOwnedBoneConflictCount(
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
