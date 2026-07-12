/**
 * TemporalUpperBodyState 由来の arm state、lost duration、recovery jump、neutral jitter metric を計算する。
 * Temporal parser が invalid とした frame は metric 内で補正せず、入力不足として扱う。
 */
import type {
    TemporalArmState,
    TemporalTuple3,
    TemporalUpperBodyState,
} from "../temporal/temporalUpperBodyState";
import type { SincroMotionDebugFrame } from "./motionDebugLogSchema";
import { parseTemporal } from "./motionMetricFrameParsers";
import type { MotionP0FixtureId, NumericMetricComputation } from "./motionMetricTypes";

export { calculateRecoveryJumpAngleDeg } from "./motionMetricRecoveryCalculators";

// temporal metrics は保存済み frame.temporal と recovery window の arm state だけを読む metric group。
// tracker degradation、solver Phase 6 / final pose、intent semantic 判定、summary / comparison はこの module では扱わない。
type ArmSide = "left" | "right";

const ARM_SIDES: ArmSide[] = ["left", "right"];

export function calculateTemporalArmStateCount(
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

export function calculateTemporalLostArmDurationMs(
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

export function calculateTemporalMaxRecoveryJumpDegEquivalent(
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

export function calculateTemporalNeutralWristJitter(
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

function squaredTupleDistance(left: TemporalTuple3, right: TemporalTuple3): number {
    const dx = right[0] - left[0];
    const dy = right[1] - left[1];
    const dz = right[2] - left[2];
    return dx * dx + dy * dy + dz * dz;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
