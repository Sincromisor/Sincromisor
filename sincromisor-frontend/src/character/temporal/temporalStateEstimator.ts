import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type { OneEuroFilterConfig } from "./oneEuroFilter";
import { createArmFilters, resetArmFilters } from "./temporalArmFilters";
import { type ClassificationHold, updateTemporalArm } from "./temporalArmStateEstimator";
import { updateTemporalHead } from "./temporalHeadStateEstimator";
import { aggregateArmReliability } from "./temporalReliabilityAggregation";
import {
    TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
    type TemporalUpperBodyState,
} from "./temporalUpperBodyState";
import { uniqueWarnings } from "./temporalWarnings";

export type TemporalStateEstimatorConfig = {
    armFilter: OneEuroFilterConfig;
    trackedConfidenceThreshold: number;
    lostConfidenceThreshold: number;
    classificationConfidenceThreshold: number;
    classificationHoldMs: number;
    maxFilterDtMs: number;
    predictionMaxMs: number;
    predictionVelocityDampingPerSec: number;
    comfortableFallbackAfterMs: number;
    recoveringBlendMs: number;
    maxRecoveringAngleJumpRad: number;
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
        predictionMaxMs: 700,
        predictionVelocityDampingPerSec: 0.55,
        comfortableFallbackAfterMs: 700,
        recoveringBlendMs: 260,
        maxRecoveringAngleJumpRad: (15 * Math.PI) / 180,
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
        this.#config = normalizeConfig(config);
        this.#leftFilters = createArmFilters(this.#config.armFilter);
        this.#rightFilters = createArmFilters(this.#config.armFilter);
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

        const head = updateTemporalHead({
            canonicalHead: input.canonical.head,
            reliability: input.reliability,
            previousHead: this.#previous?.head,
            dtMs: safeDtMs,
            isInvalidDt,
            config: this.#config,
        });

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
        if (head !== undefined) {
            state.head = head;
        }
        state.warnings = uniqueWarnings([...state.warnings, ...(state.head?.warnings ?? [])]);

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

function normalizeConfig(config: TemporalStateEstimatorConfig): TemporalStateEstimatorConfig {
    return {
        ...config,
        armFilter: { ...config.armFilter },
        recoveringBlendMs: clamp(config.recoveringBlendMs, 180, 400),
    };
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}
