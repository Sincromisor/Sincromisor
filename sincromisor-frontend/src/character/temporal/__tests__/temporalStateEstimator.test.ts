import { describe, expect, it } from "vitest";

import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../canonical/canonicalUpperBodyState";
import {
    createDefaultReliabilityMap,
    type ReliabilityMap,
    type ReliabilityPartState,
} from "../../reliability/reliabilityMap";
import {
    createDefaultTemporalStateEstimatorConfig,
    TemporalStateEstimator,
} from "../temporalStateEstimator";

const BASE_META: CanonicalPartMeta = {
    confidence: 1,
    source: "pose",
    warnings: [],
    outOfRangeFields: [],
};

function createArm(overrides: Partial<CanonicalArmState> = {}): CanonicalArmState {
    return {
        ...BASE_META,
        reach: 0.4,
        elevationRad: 0.1,
        openness: 0.2,
        forwardness: 0.3,
        elbowFlexionRad: 1.1,
        classification: "front",
        bodyLocalWrist: [0.2, 0.3, 0.4],
        bodyLocalElbow: [0.1, 0.2, 0.3],
        ...overrides,
    };
}

function createCanonical(
    mediaTimeMs: number,
    leftOverrides: Partial<CanonicalArmState> = {},
    rightOverrides: Partial<CanonicalArmState> = {},
): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
            poseLastUpdatedAtMs: mediaTimeMs,
        },
        torso: {
            ...BASE_META,
            coordinateSystem: "body_local",
            shoulderCenter: [0, 1, 0],
            hipCenter: [0, 0, 0],
            bodyRight: [1, 0, 0],
            bodyUp: [0, 1, 0],
            bodyFront: [0, 0, 1],
            shoulderWidth: 1,
            torsoScale: 1,
            yawRad: 0,
        },
        arms: {
            left: createArm(leftOverrides),
            right: createArm({ classification: "side", ...rightOverrides }),
        },
        calibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        warnings: [],
    };
}

function createTrackedReliability(mediaTimeMs: number): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    setArmReliability(reliability, "left", "tracked");
    setArmReliability(reliability, "right", "tracked");
    return reliability;
}

function setArmReliability(
    reliability: ReliabilityMap,
    side: "left" | "right",
    state: ReliabilityPartState,
): void {
    if (side === "left") {
        reliability.parts.leftArm.state = state;
        reliability.joints.leftShoulder.state = state;
        reliability.joints.leftElbow.state = state;
        reliability.joints.leftWrist.state = state;
        return;
    }
    reliability.parts.rightArm.state = state;
    reliability.joints.rightShoulder.state = state;
    reliability.joints.rightElbow.state = state;
    reliability.joints.rightWrist.state = state;
}

describe("TemporalStateEstimator", () => {
    it("creates an initial tracked frame from canonical arm scalars", () => {
        const estimator = new TemporalStateEstimator();

        const temporal = estimator.update({
            canonical: createCanonical(1000),
            reliability: createTrackedReliability(1000),
            mediaTimeMs: 1000,
        });

        expect(temporal.timestamp).toEqual({
            mediaTimeMs: 1000,
            canonicalMediaTimeMs: 1000,
            poseLastUpdatedAtMs: 1000,
        });
        expect(temporal.arms.left).toMatchObject({
            state: "tracked",
            confidence: 1,
            source: "canonical",
            stateAgeMs: 0,
            observedAgeMs: 0,
            reach: 0.4,
            bodyLocalWrist: [0.2, 0.3, 0.4],
            classification: "side",
            warnings: ["classification_held"],
        });
        expect(temporal.arms.left.velocity).toEqual({
            wrist: undefined,
            reachPerSec: 0,
            elevationRadPerSec: 0,
            opennessPerSec: 0,
            forwardnessPerSec: 0,
            elbowFlexionRadPerSec: 0,
        });
    });

    it("filters tracked continuous frames and derives velocity from filtered values", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });

        const temporal = estimator.update({
            canonical: createCanonical(100, {
                reach: 0.8,
                bodyLocalWrist: [0.4, 0.5, 0.6],
            }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });

        expect(temporal.arms.left.state).toBe("tracked");
        expect(temporal.arms.left.stateAgeMs).toBe(100);
        expect(temporal.arms.left.reach).toBeGreaterThan(0.4);
        expect(temporal.arms.left.reach).toBeLessThan(0.8);
        expect(temporal.arms.left.velocity.reachPerSec).toBeGreaterThan(0);
        expect(temporal.arms.left.velocity.wrist?.[0]).toBeGreaterThan(0);
    });

    it("downcasts suspect reliability to a suspect temporal arm state", () => {
        const estimator = new TemporalStateEstimator();
        const reliability = createTrackedReliability(0);
        reliability.joints.leftWrist.state = "predicted";

        const temporal = estimator.update({
            canonical: createCanonical(0),
            reliability,
            mediaTimeMs: 0,
        });

        expect(temporal.arms.left.state).toBe("suspect");
        expect(temporal.arms.left.source).toBe("canonical");
        expect(temporal.arms.left.warnings).toEqual(["classification_held"]);
    });

    it("keeps previous filtered values on lost frames", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });

        const temporal = estimator.update({
            canonical: createCanonical(100, { confidence: 0.01, reach: 0.9 }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });

        expect(temporal.arms.left).toMatchObject({
            state: "lost",
            source: "neutral",
            confidence: 0.01,
            observedAgeMs: 100,
            reach: 0.4,
            warnings: ["low_confidence", "dropout", "classification_held"],
        });
        expect(temporal.arms.left.velocity.reachPerSec).toBe(0);
    });

    it("does not update filters when dt is invalid", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(100),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });

        const temporal = estimator.update({
            canonical: createCanonical(100, { reach: 0.8 }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });

        expect(temporal.arms.left.state).toBe("tracked");
        expect(temporal.arms.left.reach).toBe(0.4);
        expect(temporal.arms.left.velocity.reachPerSec).toBe(0);
        expect(temporal.arms.left.warnings).toEqual(
            expect.arrayContaining(["classification_held", "out_of_range"]),
        );
        expect(temporal.warnings).toContain("out_of_range");
    });

    it("holds classification until the candidate is stable for the configured duration", () => {
        const estimator = new TemporalStateEstimator();
        const reliability = createTrackedReliability(0);

        const initial = estimator.update({
            canonical: createCanonical(0, { classification: "front" }),
            reliability,
            mediaTimeMs: 0,
        });
        const held = estimator.update({
            canonical: createCanonical(100, { classification: "front" }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });
        const committed = estimator.update({
            canonical: createCanonical(160, { classification: "front" }),
            reliability: createTrackedReliability(160),
            mediaTimeMs: 160,
        });

        expect(initial.arms.left.classification).toBe("side");
        expect(held.arms.left.classification).toBe("side");
        expect(held.arms.left.warnings).toContain("classification_held");
        expect(committed.arms.left.classification).toBe("front");
        expect(committed.arms.left.warnings).not.toContain("classification_held");
    });

    it("reinitializes temporal state, filters, and classification hold on reset", () => {
        const estimator = new TemporalStateEstimator(createDefaultTemporalStateEstimatorConfig());
        estimator.update({
            canonical: createCanonical(0, { classification: "front" }),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        estimator.update({
            canonical: createCanonical(200, { classification: "front", reach: 0.8 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });

        estimator.reset();
        const temporal = estimator.update({
            canonical: createCanonical(1000, { classification: "front", reach: 0.7 }),
            reliability: createTrackedReliability(1000),
            mediaTimeMs: 1000,
        });

        expect(temporal.arms.left.reach).toBe(0.7);
        expect(temporal.arms.left.stateAgeMs).toBe(0);
        expect(temporal.arms.left.classification).toBe("side");
        expect(temporal.arms.left.warnings).toContain("classification_held");
    });
});
