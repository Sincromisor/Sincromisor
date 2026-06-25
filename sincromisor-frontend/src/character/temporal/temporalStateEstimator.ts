import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { OneEuroFilterConfig } from "./oneEuroFilter";
import { createArmFilters, resetArmFilters } from "./temporalArmFilters";
import {
    type ClassificationHold,
    uniqueWarnings,
    updateTemporalArm,
} from "./temporalArmStateEstimator";
import { aggregateArmReliability } from "./temporalReliabilityAggregation";
import {
    TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
    type TemporalUpperBodyState,
} from "./temporalUpperBodyState";

export type TemporalStateEstimatorConfig = {
    armFilter: OneEuroFilterConfig;
    trackedConfidenceThreshold: number;
    lostConfidenceThreshold: number;
    classificationConfidenceThreshold: number;
    classificationHoldMs: number;
    maxFilterDtMs: number;
};

export type TemporalStateEstimatorInput = {
    canonical: CanonicalUpperBodyState;
    reliability?: ReliabilityMap;
    mediaTimeMs: number;
};

const DEFAULT_ARM_FILTER_CONFIG: OneEuroFilterConfig = {
    minCutoff: 1.8,
    beta: 0.45,
    dCutoff: 1.0,
};

export function createDefaultTemporalStateEstimatorConfig(): TemporalStateEstimatorConfig {
    return {
        armFilter: { ...DEFAULT_ARM_FILTER_CONFIG },
        trackedConfidenceThreshold: 0.65,
        lostConfidenceThreshold: 0.05,
        classificationConfidenceThreshold: 0.35,
        classificationHoldMs: 160,
        maxFilterDtMs: 250,
    };
}

export class TemporalStateEstimator {
    readonly #config: TemporalStateEstimatorConfig;
    readonly #leftFilters;
    readonly #rightFilters;
    #previous: TemporalUpperBodyState | undefined;
    #leftClassificationHold: ClassificationHold | undefined;
    #rightClassificationHold: ClassificationHold | undefined;

    constructor(
        config: TemporalStateEstimatorConfig = createDefaultTemporalStateEstimatorConfig(),
    ) {
        this.#config = config;
        this.#leftFilters = createArmFilters(config.armFilter);
        this.#rightFilters = createArmFilters(config.armFilter);
    }

    update(input: TemporalStateEstimatorInput): TemporalUpperBodyState {
        const dtMs =
            this.#previous === undefined
                ? 0
                : input.mediaTimeMs - this.#previous.timestamp.mediaTimeMs;
        const isInvalidDt =
            this.#previous !== undefined &&
            (!Number.isFinite(dtMs) || dtMs <= 0 || dtMs > this.#config.maxFilterDtMs);
        const safeDtMs = isInvalidDt ? 0 : dtMs;

        const left = updateTemporalArm({
            side: "left",
            canonicalArm: input.canonical.arms.left,
            reliability: aggregateArmReliability("left", input.reliability),
            previousArm: this.#previous?.arms.left,
            filters: this.#leftFilters,
            classificationHold: this.#leftClassificationHold,
            dtMs: safeDtMs,
            isInvalidDt,
            config: this.#config,
        });
        const right = updateTemporalArm({
            side: "right",
            canonicalArm: input.canonical.arms.right,
            reliability: aggregateArmReliability("right", input.reliability),
            previousArm: this.#previous?.arms.right,
            filters: this.#rightFilters,
            classificationHold: this.#rightClassificationHold,
            dtMs: safeDtMs,
            isInvalidDt,
            config: this.#config,
        });

        this.#leftClassificationHold = left.classificationHold;
        this.#rightClassificationHold = right.classificationHold;

        const state: TemporalUpperBodyState = {
            schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
            timestamp: {
                mediaTimeMs: input.mediaTimeMs,
                canonicalMediaTimeMs: input.canonical.timestamp.mediaTimeMs,
                poseLastUpdatedAtMs: input.canonical.timestamp.poseLastUpdatedAtMs,
            },
            arms: {
                left: left.arm,
                right: right.arm,
            },
            warnings: uniqueWarnings([...left.arm.warnings, ...right.arm.warnings]),
        };

        this.#previous = state;
        return state;
    }

    reset(): void {
        this.#previous = undefined;
        this.#leftClassificationHold = undefined;
        this.#rightClassificationHold = undefined;
        resetArmFilters(this.#leftFilters);
        resetArmFilters(this.#rightFilters);
    }
}
