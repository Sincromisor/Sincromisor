import {
    calculateVelocity,
    type FilteredArmValues,
    filterObservedArm,
    holdPreviousArm,
    tupleOrUndefined,
} from "./temporalArmFilters";
import type { ArmUpdateContext } from "./temporalArmStateEstimator";
import type { ArmSide } from "./temporalReliabilityAggregation";
import type {
    TemporalArmState,
    TemporalTuple3,
    TemporalWarningCode,
} from "./temporalUpperBodyState";
import { uniqueWarnings } from "./temporalWarnings";

type ArmClassification = TemporalArmState["classification"];
type RecoveringFrom = NonNullable<TemporalArmState["recoveringBlend"]>["from"];

export function createPredictedArm(
    context: ArmUpdateContext,
    baseArm: TemporalArmState,
    warnings: TemporalWarningCode[],
    classification: ArmClassification,
    observedAgeMs: number,
): TemporalArmState {
    const damping = dampingForDt(context.config.predictionVelocityDampingPerSec, context.dtMs);
    const velocity = dampArmVelocity(baseArm.velocity, damping);
    const predicted = advanceArm(baseArm, velocity, context.dtMs);
    return {
        ...baseArm,
        state: "predicted",
        confidence: context.canonicalArm.confidence,
        source: "predicted",
        stateAgeMs: baseArm.state === "predicted" ? baseArm.stateAgeMs + context.dtMs : 0,
        observedAgeMs,
        warnings: uniqueWarnings([...warnings, "prediction_active", "velocity_damped"]),
        reach: predicted.reach,
        elevationRad: predicted.elevationRad,
        openness: predicted.openness,
        forwardness: predicted.forwardness,
        elbowFlexionRad: predicted.elbowFlexionRad,
        classification,
        bodyLocalWrist: predicted.bodyLocalWrist,
        bodyLocalElbow: baseArm.bodyLocalElbow,
        velocity,
        recoveringBlend: undefined,
    };
}

export function createComfortableArm(
    context: ArmUpdateContext,
    baseArm: TemporalArmState,
    warnings: TemporalWarningCode[],
    classification: ArmClassification,
    observedAgeMs: number,
): TemporalArmState {
    const target = comfortableArmValues(context.side);
    const alpha = blendAlpha(context.dtMs, context.config.recoveringBlendMs);
    const blended = blendArmValues(holdPreviousArm(baseArm), target, alpha);
    return {
        ...baseArm,
        state: "lost",
        confidence: context.canonicalArm.confidence,
        source: "comfortable",
        stateAgeMs: baseArm.state === "lost" ? baseArm.stateAgeMs + context.dtMs : 0,
        observedAgeMs,
        warnings: uniqueWarnings([...warnings, "prediction_expired"]),
        reach: blended.reach,
        elevationRad: blended.elevationRad,
        openness: blended.openness,
        forwardness: blended.forwardness,
        elbowFlexionRad: blended.elbowFlexionRad,
        classification,
        bodyLocalWrist: blended.bodyLocalWrist,
        bodyLocalElbow: blendTuple(baseArm.bodyLocalElbow, target.bodyLocalElbow, alpha),
        velocity: calculateVelocity(blended, context.previousArm, context.dtMs),
        recoveringBlend: undefined,
    };
}

export function createRecoveringArm(
    context: ArmUpdateContext,
    baseArm: TemporalArmState,
    warnings: TemporalWarningCode[],
    classification: ArmClassification,
): TemporalArmState {
    const filtered = filterObservedArm(context.canonicalArm, context.filters, context.dtMs);
    const previousProgress =
        baseArm.state === "recovering" ? (baseArm.recoveringBlend?.progress ?? 0) : 0;
    const progress = Math.min(
        1,
        previousProgress + context.dtMs / context.config.recoveringBlendMs,
    );
    if (progress >= 1) {
        return createRecoveredTrackedArm(context, baseArm, filtered, warnings, classification);
    }

    const blended = clampRecoveringJump(
        holdPreviousArm(baseArm),
        blendArmValues(holdPreviousArm(baseArm), filtered, progress),
        context.config.maxRecoveringAngleJumpRad,
    );
    return {
        state: "recovering",
        confidence: context.canonicalArm.confidence,
        source: "mixed",
        stateAgeMs: baseArm.state === "recovering" ? baseArm.stateAgeMs + context.dtMs : 0,
        observedAgeMs: 0,
        warnings: uniqueWarnings([...warnings, "recovery_blend"]),
        reach: blended.reach,
        elevationRad: blended.elevationRad,
        openness: blended.openness,
        forwardness: blended.forwardness,
        elbowFlexionRad: blended.elbowFlexionRad,
        classification,
        bodyLocalWrist: blended.bodyLocalWrist,
        bodyLocalElbow: blendTuple(
            baseArm.bodyLocalElbow,
            tupleOrUndefined(context.canonicalArm.bodyLocalElbow),
            progress,
        ),
        velocity: calculateVelocity(blended, context.previousArm, context.dtMs),
        recoveringBlend: {
            from: recoveringFrom(baseArm.source),
            progress,
            durationMs: context.config.recoveringBlendMs,
        },
    };
}

function createRecoveredTrackedArm(
    context: ArmUpdateContext,
    baseArm: TemporalArmState,
    filtered: FilteredArmValues,
    warnings: TemporalWarningCode[],
    classification: ArmClassification,
): TemporalArmState {
    return {
        state: "tracked",
        confidence: context.canonicalArm.confidence,
        source: "canonical",
        stateAgeMs: 0,
        observedAgeMs: 0,
        warnings: uniqueWarnings(warnings),
        reach: filtered.reach,
        elevationRad: filtered.elevationRad,
        openness: filtered.openness,
        forwardness: filtered.forwardness,
        elbowFlexionRad: filtered.elbowFlexionRad,
        classification,
        bodyLocalWrist: filtered.bodyLocalWrist,
        bodyLocalElbow:
            tupleOrUndefined(context.canonicalArm.bodyLocalElbow) ?? baseArm.bodyLocalElbow,
        velocity: calculateVelocity(filtered, context.previousArm, context.dtMs),
    };
}

function dampingForDt(dampingPerSec: number, dtMs: number): number {
    return dampingPerSec ** (Math.max(0, dtMs) / 1000);
}

function dampArmVelocity(
    velocity: TemporalArmState["velocity"],
    damping: number,
): TemporalArmState["velocity"] {
    return {
        wrist:
            velocity.wrist === undefined
                ? undefined
                : [
                      velocity.wrist[0] * damping,
                      velocity.wrist[1] * damping,
                      velocity.wrist[2] * damping,
                  ],
        reachPerSec: velocity.reachPerSec * damping,
        elevationRadPerSec: velocity.elevationRadPerSec * damping,
        opennessPerSec: velocity.opennessPerSec * damping,
        forwardnessPerSec: velocity.forwardnessPerSec * damping,
        elbowFlexionRadPerSec: velocity.elbowFlexionRadPerSec * damping,
    };
}

function advanceArm(
    arm: TemporalArmState,
    velocity: TemporalArmState["velocity"],
    dtMs: number,
): FilteredArmValues {
    const dtSec = dtMs / 1000;
    return {
        reach: clamp(arm.reach + velocity.reachPerSec * dtSec, 0, 1.15),
        elevationRad: clamp(
            arm.elevationRad + velocity.elevationRadPerSec * dtSec,
            -Math.PI / 2,
            Math.PI / 2,
        ),
        openness: clamp(arm.openness + velocity.opennessPerSec * dtSec, -1, 1),
        forwardness: clamp(arm.forwardness + velocity.forwardnessPerSec * dtSec, 0, 1),
        elbowFlexionRad: clamp(
            arm.elbowFlexionRad + velocity.elbowFlexionRadPerSec * dtSec,
            0,
            Math.PI,
        ),
        bodyLocalWrist:
            arm.bodyLocalWrist === undefined || velocity.wrist === undefined
                ? arm.bodyLocalWrist
                : [
                      arm.bodyLocalWrist[0] + velocity.wrist[0] * dtSec,
                      arm.bodyLocalWrist[1] + velocity.wrist[1] * dtSec,
                      arm.bodyLocalWrist[2] + velocity.wrist[2] * dtSec,
                  ],
    };
}

function comfortableArmValues(
    side: ArmSide,
): FilteredArmValues & { bodyLocalElbow: TemporalTuple3 } {
    const sideSign = side === "left" ? -1 : 1;
    return {
        reach: 0.35,
        elevationRad: -0.25,
        openness: 0.15,
        forwardness: 0.15,
        elbowFlexionRad: 1.15,
        bodyLocalWrist: [sideSign * 0.35, -0.09, 0.15],
        bodyLocalElbow: [sideSign * 0.18, -0.04, 0.08],
    };
}

function blendArmValues(
    from: FilteredArmValues,
    to: FilteredArmValues,
    alpha: number,
): FilteredArmValues {
    return {
        reach: lerp(from.reach, to.reach, alpha),
        elevationRad: lerp(from.elevationRad, to.elevationRad, alpha),
        openness: lerp(from.openness, to.openness, alpha),
        forwardness: lerp(from.forwardness, to.forwardness, alpha),
        elbowFlexionRad: lerp(from.elbowFlexionRad, to.elbowFlexionRad, alpha),
        bodyLocalWrist: blendTuple(from.bodyLocalWrist, to.bodyLocalWrist, alpha),
    };
}

function clampRecoveringJump(
    previous: FilteredArmValues,
    next: FilteredArmValues,
    maxAngleJumpRad: number,
): FilteredArmValues {
    const rangeRatio = maxAngleJumpRad / Math.PI;
    return {
        reach: clampJump(previous.reach, next.reach, 1.15 * rangeRatio),
        elevationRad: clampJump(previous.elevationRad, next.elevationRad, maxAngleJumpRad),
        openness: clampJump(previous.openness, next.openness, 2 * rangeRatio),
        forwardness: clampJump(previous.forwardness, next.forwardness, rangeRatio),
        elbowFlexionRad: clampJump(previous.elbowFlexionRad, next.elbowFlexionRad, maxAngleJumpRad),
        bodyLocalWrist: next.bodyLocalWrist,
    };
}

function blendTuple(
    from: TemporalTuple3 | undefined,
    to: TemporalTuple3 | undefined,
    alpha: number,
): TemporalTuple3 | undefined {
    if (from === undefined) {
        return to;
    }
    if (to === undefined) {
        return from;
    }
    return [lerp(from[0], to[0], alpha), lerp(from[1], to[1], alpha), lerp(from[2], to[2], alpha)];
}

function recoveringFrom(source: TemporalArmState["source"]): RecoveringFrom {
    if (source === "predicted" || source === "comfortable") {
        return source;
    }
    return "neutral";
}

function blendAlpha(dtMs: number, durationMs: number): number {
    if (durationMs <= 0) {
        return 1;
    }
    return clamp(dtMs / durationMs, 0, 1);
}

function lerp(from: number, to: number, alpha: number): number {
    return from + (to - from) * alpha;
}

function clampJump(previous: number, next: number, maxDelta: number): number {
    return previous + clamp(next - previous, -maxDelta, maxDelta);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
