import type { HeadUpdateContext } from "./temporalHeadStateEstimator";
import type { TemporalHeadState, TemporalWarningCode } from "./temporalUpperBodyState";
import { uniqueWarnings } from "./temporalWarnings";

export function createNeutralHead(): TemporalHeadState {
    return {
        state: "lost",
        confidence: 0,
        source: "neutral",
        stateAgeMs: 0,
        observedAgeMs: 0,
        warnings: ["dropout"],
        yawRad: 0,
        pitchRad: 0,
        rollRad: 0,
        angularVelocityRadPerSec: {
            yaw: 0,
            pitch: 0,
            roll: 0,
        },
    };
}

export function predictHead(
    context: HeadUpdateContext,
    baseHead: TemporalHeadState,
    observedAgeMs: number,
    warnings: TemporalWarningCode[],
): TemporalHeadState {
    const damping = dampingForDt(context.config.predictionVelocityDampingPerSec, context.dtMs);
    const velocity = {
        yaw: baseHead.angularVelocityRadPerSec.yaw * damping,
        pitch: baseHead.angularVelocityRadPerSec.pitch * damping,
        roll: baseHead.angularVelocityRadPerSec.roll * damping,
    };
    const dtSec = context.dtMs / 1000;
    return {
        ...baseHead,
        state: "predicted",
        confidence: context.canonicalHead?.confidence ?? 0,
        source: "predicted",
        stateAgeMs: baseHead.state === "predicted" ? baseHead.stateAgeMs + context.dtMs : 0,
        observedAgeMs,
        warnings: uniqueWarnings([...warnings, "prediction_active", "velocity_damped"]),
        yawRad: baseHead.yawRad + velocity.yaw * dtSec,
        pitchRad: baseHead.pitchRad + velocity.pitch * dtSec,
        rollRad: baseHead.rollRad + velocity.roll * dtSec,
        angularVelocityRadPerSec: velocity,
        recoveringBlend: undefined,
    };
}

export function blendHeadToNeutral(
    context: HeadUpdateContext,
    baseHead: TemporalHeadState,
    observedAgeMs: number,
    warnings: TemporalWarningCode[],
): TemporalHeadState {
    const alpha = blendAlpha(context.dtMs, context.config.recoveringBlendMs);
    const yawRad = lerp(baseHead.yawRad, 0, alpha);
    const pitchRad = lerp(baseHead.pitchRad, 0, alpha);
    const rollRad = lerp(baseHead.rollRad, 0, alpha);
    return {
        ...baseHead,
        state: "lost",
        confidence: context.canonicalHead?.confidence ?? 0,
        source: "comfortable",
        stateAgeMs: baseHead.state === "lost" ? baseHead.stateAgeMs + context.dtMs : 0,
        observedAgeMs,
        warnings: uniqueWarnings([...warnings, "prediction_expired"]),
        yawRad,
        pitchRad,
        rollRad,
        angularVelocityRadPerSec: calculateHeadVelocity(
            yawRad,
            pitchRad,
            rollRad,
            context.previousHead,
            context.dtMs,
        ),
        recoveringBlend: undefined,
    };
}

export function recoverHead(
    context: HeadUpdateContext,
    baseHead: TemporalHeadState,
    warnings: TemporalWarningCode[],
): TemporalHeadState {
    const head = context.canonicalHead;
    if (head === undefined) {
        return createNeutralHead();
    }
    const previousProgress =
        baseHead.state === "recovering" ? (baseHead.recoveringBlend?.progress ?? 0) : 0;
    const progress = Math.min(
        1,
        previousProgress + context.dtMs / context.config.recoveringBlendMs,
    );
    if (progress >= 1) {
        return createObservedTrackedHead(context, warnings);
    }
    const yawRad = clampJump(
        baseHead.yawRad,
        lerp(baseHead.yawRad, head.yawRad, progress),
        context.config.maxRecoveringAngleJumpRad,
    );
    const pitchRad = clampJump(
        baseHead.pitchRad,
        lerp(baseHead.pitchRad, head.pitchRad, progress),
        context.config.maxRecoveringAngleJumpRad,
    );
    const rollRad = clampJump(
        baseHead.rollRad,
        lerp(baseHead.rollRad, head.rollRad, progress),
        context.config.maxRecoveringAngleJumpRad,
    );
    return {
        state: "recovering",
        confidence: head.confidence,
        source: "mixed",
        stateAgeMs: baseHead.state === "recovering" ? baseHead.stateAgeMs + context.dtMs : 0,
        observedAgeMs: 0,
        warnings: uniqueWarnings([...warnings, "recovery_blend"]),
        yawRad,
        pitchRad,
        rollRad,
        angularVelocityRadPerSec: calculateHeadVelocity(
            yawRad,
            pitchRad,
            rollRad,
            context.previousHead,
            context.dtMs,
        ),
        recoveringBlend: {
            from: recoveringFrom(baseHead.source),
            progress,
            durationMs: context.config.recoveringBlendMs,
        },
    };
}

function createObservedTrackedHead(
    context: HeadUpdateContext,
    warnings: TemporalWarningCode[],
): TemporalHeadState {
    const head = context.canonicalHead;
    if (head === undefined) {
        return createNeutralHead();
    }
    return {
        state: "tracked",
        confidence: head.confidence,
        source: "canonical",
        stateAgeMs: 0,
        observedAgeMs: 0,
        warnings: uniqueWarnings(warnings),
        yawRad: head.yawRad,
        pitchRad: head.pitchRad,
        rollRad: head.rollRad,
        angularVelocityRadPerSec: calculateHeadVelocity(
            head.yawRad,
            head.pitchRad,
            head.rollRad,
            context.previousHead,
            context.dtMs,
        ),
    };
}

export function calculateHeadVelocity(
    yawRad: number,
    pitchRad: number,
    rollRad: number,
    previousHead: TemporalHeadState | undefined,
    dtMs: number,
): TemporalHeadState["angularVelocityRadPerSec"] {
    if (previousHead === undefined || dtMs <= 0) {
        return { yaw: 0, pitch: 0, roll: 0 };
    }
    const dtSec = dtMs / 1000;
    return {
        yaw: (yawRad - previousHead.yawRad) / dtSec,
        pitch: (pitchRad - previousHead.pitchRad) / dtSec,
        roll: (rollRad - previousHead.rollRad) / dtSec,
    };
}

function recoveringFrom(
    source: TemporalHeadState["source"],
): "predicted" | "comfortable" | "neutral" {
    if (source === "predicted" || source === "comfortable") {
        return source;
    }
    return "neutral";
}

function dampingForDt(dampingPerSec: number, dtMs: number): number {
    return dampingPerSec ** (Math.max(0, dtMs) / 1000);
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
