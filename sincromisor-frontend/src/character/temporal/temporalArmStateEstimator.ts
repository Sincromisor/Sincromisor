import type { CanonicalArmState } from "../canonical/canonicalUpperBodyState";
import {
    createComfortableArm,
    createPredictedArm,
    createRecoveringArm,
} from "./temporalArmDropout";
import {
    type ArmFilters,
    calculateVelocity,
    createZeroVelocity,
    type FilteredArmValues,
    filterObservedArm,
    holdPreviousArm,
    tupleOrUndefined,
} from "./temporalArmFilters";
import type { ArmReliabilitySnapshot, ArmSide } from "./temporalReliabilityAggregation";
import type { TemporalStateEstimatorConfig } from "./temporalStateEstimator";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalArmState,
    type TemporalPartState,
    type TemporalWarningCode,
} from "./temporalUpperBodyState";
import { uniqueWarnings } from "./temporalWarnings";

type ArmClassification = TemporalArmState["classification"];

export type ClassificationHold = {
    candidate: ArmClassification;
    durationMs: number;
};

export type ArmUpdateContext = {
    side: ArmSide;
    canonicalArm: CanonicalArmState;
    reliability: ArmReliabilitySnapshot;
    previousArm: TemporalArmState | undefined;
    filters: ArmFilters;
    classificationHold: ClassificationHold | undefined;
    dtMs: number;
    isInvalidDt: boolean;
    config: TemporalStateEstimatorConfig;
};

export function updateTemporalArm(context: ArmUpdateContext): {
    arm: TemporalArmState;
    classificationHold: ClassificationHold | undefined;
} {
    const observedState = determineArmState(
        context.canonicalArm.confidence,
        context.reliability,
        context.config,
    );
    const previousArm = context.previousArm;
    const defaultArm = createDefaultTemporalUpperBodyState(0).arms[context.side];
    const baseArm = previousArm ?? defaultArm;
    const warnings = buildWarnings(
        context.canonicalArm.confidence,
        observedState,
        context.isInvalidDt,
        context.config,
    );
    const classification = updateClassification(
        context.canonicalArm,
        baseArm.classification,
        context.classificationHold,
        context.dtMs,
        context.isInvalidDt,
        context.config,
    );

    if (classification.wasHeld) {
        warnings.push("classification_held");
    }

    if (context.isInvalidDt) {
        return {
            arm: createObservedArm(
                context,
                observedState,
                baseArm,
                holdPreviousArm(baseArm),
                createZeroVelocity(previousArm),
                uniqueWarnings(warnings),
                classification.value,
            ),
            classificationHold: classification.hold,
        };
    }

    if (
        observedState === "tracked" &&
        previousArm !== undefined &&
        (previousArm.state === "lost" ||
            previousArm.state === "predicted" ||
            previousArm.state === "recovering")
    ) {
        return {
            arm: createRecoveringArm(context, baseArm, warnings, classification.value),
            classificationHold: classification.hold,
        };
    }

    if (observedState === "lost" && previousArm !== undefined) {
        const observedAgeMs = (previousArm?.observedAgeMs ?? 0) + context.dtMs;
        if (observedAgeMs <= context.config.predictionMaxMs) {
            return {
                arm: createPredictedArm(
                    context,
                    baseArm,
                    warnings,
                    classification.value,
                    observedAgeMs,
                ),
                classificationHold: classification.hold,
            };
        }
        if (
            observedAgeMs >
            Math.max(context.config.comfortableFallbackAfterMs, context.config.predictionMaxMs)
        ) {
            return {
                arm: createComfortableArm(context, baseArm, warnings, observedAgeMs),
                classificationHold: classification.hold,
            };
        }
        return {
            arm: {
                ...createObservedArm(
                    context,
                    observedState,
                    baseArm,
                    holdPreviousArm(baseArm),
                    createZeroVelocity(previousArm),
                    uniqueWarnings([...warnings, "prediction_expired"]),
                    classification.value,
                ),
                source: "previous",
                observedAgeMs,
            },
            classificationHold: classification.hold,
        };
    }
    if (observedState === "lost") {
        return {
            arm: createObservedArm(
                context,
                observedState,
                baseArm,
                holdPreviousArm(baseArm),
                createZeroVelocity(previousArm),
                uniqueWarnings(warnings),
                classification.value,
            ),
            classificationHold: classification.hold,
        };
    }

    const filtered = filterObservedArm(context.canonicalArm, context.filters, context.dtMs);
    const velocity = calculateVelocity(filtered, previousArm, context.dtMs);

    return {
        arm: createObservedArm(
            context,
            observedState,
            baseArm,
            filtered,
            velocity,
            uniqueWarnings(warnings),
            classification.value,
        ),
        classificationHold: classification.hold,
    };
}

function createObservedArm(
    context: ArmUpdateContext,
    state: TemporalPartState,
    baseArm: TemporalArmState,
    filtered: FilteredArmValues,
    velocity: TemporalArmState["velocity"],
    warnings: TemporalWarningCode[],
    classification: ArmClassification,
): TemporalArmState {
    const shouldUseCanonical = state !== "lost";
    return {
        state,
        confidence: context.canonicalArm.confidence,
        source: shouldUseCanonical ? "canonical" : "neutral",
        stateAgeMs:
            context.previousArm !== undefined && context.previousArm.state === state
                ? context.previousArm.stateAgeMs + context.dtMs
                : 0,
        observedAgeMs:
            state === "lost" ? (context.previousArm?.observedAgeMs ?? 0) + context.dtMs : 0,
        warnings,
        reach: filtered.reach,
        elevationRad: filtered.elevationRad,
        openness: filtered.openness,
        forwardness: filtered.forwardness,
        elbowFlexionRad: filtered.elbowFlexionRad,
        classification,
        bodyLocalWrist: filtered.bodyLocalWrist,
        bodyLocalElbow: shouldUseCanonical
            ? tupleOrUndefined(context.canonicalArm.bodyLocalElbow)
            : baseArm.bodyLocalElbow,
        velocity,
    };
}

function determineArmState(
    confidence: number,
    reliability: ArmReliabilitySnapshot,
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

function updateClassification(
    arm: CanonicalArmState,
    previousClassification: ArmClassification,
    previousHold: ClassificationHold | undefined,
    dtMs: number,
    isInvalidDt: boolean,
    config: TemporalStateEstimatorConfig,
): { value: ArmClassification; hold: ClassificationHold | undefined; wasHeld: boolean } {
    if (arm.confidence < config.classificationConfidenceThreshold) {
        return {
            value: previousClassification,
            hold: undefined,
            wasHeld: arm.classification !== previousClassification,
        };
    }
    if (isInvalidDt) {
        return {
            value: previousClassification,
            hold: previousHold,
            wasHeld: arm.classification !== previousClassification,
        };
    }

    const hold =
        previousHold?.candidate === arm.classification
            ? { candidate: arm.classification, durationMs: previousHold.durationMs + dtMs }
            : { candidate: arm.classification, durationMs: 0 };

    if (hold.durationMs >= config.classificationHoldMs) {
        return {
            value: arm.classification,
            hold,
            wasHeld: false,
        };
    }

    return {
        value: previousClassification,
        hold,
        wasHeld: arm.classification !== previousClassification,
    };
}

function buildWarnings(
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
