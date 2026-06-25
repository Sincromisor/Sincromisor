import type { CanonicalArmState } from "../canonical/canonicalUpperBodyState";
import {
    type ArmFilters,
    calculateVelocity,
    createZeroVelocity,
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
    const state = determineArmState(
        context.canonicalArm.confidence,
        context.reliability,
        context.config,
    );
    const shouldUseCanonical = state !== "lost";
    const previousArm = context.previousArm;
    const defaultArm = createDefaultTemporalUpperBodyState(0).arms[context.side];
    const baseArm = previousArm ?? defaultArm;
    const warnings = buildWarnings(
        context.canonicalArm.confidence,
        state,
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

    const filtered =
        shouldUseCanonical && !context.isInvalidDt
            ? filterObservedArm(context.canonicalArm, context.filters, context.dtMs)
            : holdPreviousArm(baseArm);
    const velocity =
        shouldUseCanonical && !context.isInvalidDt
            ? calculateVelocity(filtered, previousArm, context.dtMs)
            : createZeroVelocity(previousArm);

    return {
        arm: {
            state,
            confidence: context.canonicalArm.confidence,
            source: shouldUseCanonical ? "canonical" : "neutral",
            stateAgeMs:
                previousArm !== undefined && previousArm.state === state
                    ? previousArm.stateAgeMs + context.dtMs
                    : 0,
            observedAgeMs: state === "lost" ? (previousArm?.observedAgeMs ?? 0) + context.dtMs : 0,
            warnings: uniqueWarnings(warnings),
            reach: filtered.reach,
            elevationRad: filtered.elevationRad,
            openness: filtered.openness,
            forwardness: filtered.forwardness,
            elbowFlexionRad: filtered.elbowFlexionRad,
            classification: classification.value,
            bodyLocalWrist: filtered.bodyLocalWrist,
            bodyLocalElbow: shouldUseCanonical
                ? tupleOrUndefined(context.canonicalArm.bodyLocalElbow)
                : baseArm.bodyLocalElbow,
            velocity,
        },
        classificationHold: classification.hold,
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
    if (arm.confidence < config.classificationConfidenceThreshold || isInvalidDt) {
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

export function uniqueWarnings(warnings: TemporalWarningCode[]): TemporalWarningCode[] {
    const unique: TemporalWarningCode[] = [];
    for (const warning of warnings) {
        if (!unique.includes(warning)) {
            unique.push(warning);
        }
    }
    return unique;
}
