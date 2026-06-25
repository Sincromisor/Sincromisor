import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import {
    blendHeadToNeutral,
    calculateHeadVelocity,
    createNeutralHead,
    predictHead,
    recoverHead,
} from "./temporalHeadDropout";
import type { TemporalStateEstimatorConfig } from "./temporalStateEstimator";
import type {
    TemporalHeadState,
    TemporalPartState,
    TemporalWarningCode,
} from "./temporalUpperBodyState";
import { uniqueWarnings } from "./temporalWarnings";

type HeadReliabilitySnapshot = {
    state: TemporalPartState;
    isPresent: boolean;
};

export type HeadUpdateContext = {
    canonicalHead: CanonicalUpperBodyState["head"];
    reliability: HeadReliabilitySnapshot;
    previousHead: TemporalHeadState | undefined;
    dtMs: number;
    isInvalidDt: boolean;
    config: TemporalStateEstimatorConfig;
};

export function updateTemporalHead(input: {
    canonicalHead: CanonicalUpperBodyState["head"];
    reliability: ReliabilityMap | undefined;
    previousHead: TemporalHeadState | undefined;
    dtMs: number;
    isInvalidDt: boolean;
    config: TemporalStateEstimatorConfig;
}): TemporalHeadState | undefined {
    return updateHead({
        canonicalHead: input.canonicalHead,
        reliability: aggregateHeadReliability(input.reliability),
        previousHead: input.previousHead,
        dtMs: input.dtMs,
        isInvalidDt: input.isInvalidDt,
        config: input.config,
    });
}

function updateHead(context: HeadUpdateContext): TemporalHeadState | undefined {
    if (context.canonicalHead === undefined) {
        return undefined;
    }

    const observedState = determinePartState(
        context.canonicalHead.confidence,
        context.reliability,
        context.config,
    );
    const previousHead = context.previousHead;
    const baseHead = previousHead ?? createNeutralHead();
    const observedAgeMs = observedState === "lost" ? baseHead.observedAgeMs + context.dtMs : 0;
    const baseWarnings = buildPartWarnings(
        context.canonicalHead.confidence,
        observedState,
        context.isInvalidDt,
        context.config,
    );

    if (context.isInvalidDt) {
        return {
            ...baseHead,
            state: observedState,
            confidence: context.canonicalHead.confidence,
            source: observedState === "lost" ? "neutral" : "canonical",
            warnings: uniqueWarnings(baseWarnings),
            angularVelocityRadPerSec: { yaw: 0, pitch: 0, roll: 0 },
        };
    }

    if (
        observedState === "tracked" &&
        previousHead !== undefined &&
        (previousHead.state === "lost" ||
            previousHead.state === "predicted" ||
            previousHead.state === "recovering")
    ) {
        return recoverHead(context, baseHead, baseWarnings);
    }

    if (
        observedState === "lost" &&
        previousHead !== undefined &&
        observedAgeMs <= context.config.predictionMaxMs
    ) {
        return predictHead(context, baseHead, observedAgeMs, baseWarnings);
    }

    if (
        observedState === "lost" &&
        previousHead !== undefined &&
        observedAgeMs >
            Math.max(context.config.comfortableFallbackAfterMs, context.config.predictionMaxMs)
    ) {
        return blendHeadToNeutral(context, baseHead, observedAgeMs, baseWarnings);
    }
    if (observedState === "lost") {
        return {
            ...baseHead,
            state: "lost",
            confidence: context.canonicalHead.confidence,
            source: "neutral",
            stateAgeMs: baseHead.state === "lost" ? baseHead.stateAgeMs + context.dtMs : 0,
            observedAgeMs,
            warnings: uniqueWarnings(baseWarnings),
            angularVelocityRadPerSec: { yaw: 0, pitch: 0, roll: 0 },
            recoveringBlend: undefined,
        };
    }

    return observedHead(context, observedState, baseWarnings);
}

function aggregateHeadReliability(
    reliability: ReliabilityMap | undefined,
): HeadReliabilitySnapshot {
    if (reliability === undefined) {
        return { state: "tracked", isPresent: false };
    }
    const state =
        reliability.parts.head.state === "lost" || reliability.joints.head.state === "lost"
            ? "lost"
            : reliability.parts.head.state === "tracked" &&
                reliability.joints.head.state === "tracked"
              ? "tracked"
              : "suspect";
    return { state, isPresent: true };
}

function determinePartState(
    confidence: number,
    reliability: HeadReliabilitySnapshot,
    config: TemporalStateEstimatorConfig,
): TemporalPartState {
    if (confidence < config.lostConfidenceThreshold || reliability.state === "lost") {
        return "lost";
    }
    if (
        confidence < config.trackedConfidenceThreshold ||
        (reliability.isPresent && reliability.state !== "tracked")
    ) {
        return "suspect";
    }
    return "tracked";
}

function buildPartWarnings(
    confidence: number,
    state: TemporalPartState,
    isInvalidDt: boolean,
    config: TemporalStateEstimatorConfig,
): TemporalWarningCode[] {
    const warnings: TemporalWarningCode[] = [];
    if (confidence < config.trackedConfidenceThreshold) {
        warnings.push("low_confidence");
    }
    if (state === "lost") {
        warnings.push("dropout");
    }
    if (isInvalidDt) {
        warnings.push("out_of_range");
    }
    return warnings;
}

function observedHead(
    context: HeadUpdateContext,
    state: TemporalPartState,
    warnings: TemporalWarningCode[],
): TemporalHeadState {
    const head = context.canonicalHead;
    if (head === undefined) {
        return createNeutralHead();
    }
    const velocity = calculateHeadVelocity(
        head.yawRad,
        head.pitchRad,
        head.rollRad,
        context.previousHead,
        context.dtMs,
    );
    return {
        state,
        confidence: head.confidence,
        source: "canonical",
        stateAgeMs:
            context.previousHead !== undefined && context.previousHead.state === state
                ? context.previousHead.stateAgeMs + context.dtMs
                : 0,
        observedAgeMs: 0,
        warnings: uniqueWarnings(warnings),
        yawRad: head.yawRad,
        pitchRad: head.pitchRad,
        rollRad: head.rollRad,
        angularVelocityRadPerSec: velocity,
    };
}
