import { describe, expect, it } from "vitest";

import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState as CanonicalState,
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

function createHead(
    overrides: Partial<NonNullable<CanonicalState["head"]>> = {},
): NonNullable<CanonicalState["head"]> {
    return {
        ...BASE_META,
        yawRad: 0.1,
        pitchRad: 0.05,
        rollRad: -0.05,
        ...overrides,
    };
}

function createCanonical(
    mediaTimeMs: number,
    leftOverrides: Partial<CanonicalArmState> = {},
    rightOverrides: Partial<CanonicalArmState> = {},
    headOverrides?: Partial<NonNullable<CanonicalState["head"]>>,
): CanonicalUpperBodyState {
    const canonical: CanonicalUpperBodyState = {
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
    if (headOverrides !== undefined) {
        canonical.head = createHead(headOverrides);
    }
    return canonical;
}

function createTrackedReliability(mediaTimeMs: number): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    setArmReliability(reliability, "left", "tracked");
    setArmReliability(reliability, "right", "tracked");
    setHeadReliability(reliability, "tracked");
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

function setHeadReliability(reliability: ReliabilityMap, state: ReliabilityPartState): void {
    reliability.parts.head.state = state;
    reliability.joints.head.state = state;
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

    it("predicts a 200ms dropout from the previous filtered arm", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        const moving = estimator.update({
            canonical: createCanonical(100, { reach: 0.8 }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });

        const temporal = estimator.update({
            canonical: createCanonical(300, { confidence: 0.01, reach: 0.9 }),
            reliability: createTrackedReliability(300),
            mediaTimeMs: 300,
        });

        expect(temporal.arms.left).toMatchObject({
            state: "predicted",
            source: "predicted",
            confidence: 0.01,
            observedAgeMs: 200,
        });
        expect(temporal.arms.left.reach).toBeGreaterThan(moving.arms.left.reach);
        expect(temporal.arms.left.source).not.toBe("neutral");
        expect(temporal.arms.left.warnings).toEqual(
            expect.arrayContaining(["prediction_active", "velocity_damped"]),
        );
        expect(temporal.arms.left.velocity.reachPerSec).toBeLessThan(
            moving.arms.left.velocity.reachPerSec,
        );
    });

    it("keeps dropout inside 700ms away from neutral", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });

        const temporal = estimator.update({
            canonical: createCanonical(200, { confidence: 0.01, reach: 0.9 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });

        expect(temporal.arms.left.state).toBe("predicted");
        expect(temporal.arms.left.source).toBe("predicted");
        expect(temporal.arms.left.reach).toBe(0.4);
    });

    it("moves to the comfortable fallback after the prediction window expires", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0, {
                reach: 0.9,
                elevationRad: 0.7,
                openness: 0.8,
                forwardness: 0.7,
                elbowFlexionRad: 2.1,
            }),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        estimator.update({
            canonical: createCanonical(200, { confidence: 0.01 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });
        const predicted = estimator.update({
            canonical: createCanonical(450, { confidence: 0.01 }),
            reliability: createTrackedReliability(450),
            mediaTimeMs: 450,
        });
        estimator.update({
            canonical: createCanonical(650, { confidence: 0.01 }),
            reliability: createTrackedReliability(650),
            mediaTimeMs: 650,
        });

        const comfortable = estimator.update({
            canonical: createCanonical(800, { confidence: 0.01 }),
            reliability: createTrackedReliability(800),
            mediaTimeMs: 800,
        });

        expect(comfortable.arms.left.state).toBe("lost");
        expect(comfortable.arms.left.source).toBe("comfortable");
        expect(comfortable.arms.left.warnings).toContain("prediction_expired");
        expect(Math.abs(comfortable.arms.left.reach - 0.35)).toBeLessThan(
            Math.abs(predicted.arms.left.reach - 0.35),
        );
        expect(comfortable.arms.left.openness).toBeGreaterThan(0);
        expect(comfortable.arms.left.bodyLocalWrist?.[0]).toBeLessThan(0);
        expect(comfortable.arms.right.bodyLocalWrist?.[0]).toBeGreaterThan(0);
    });

    it("recovers with a mixed source and clamps one-frame scalar jumps", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        estimator.update({
            canonical: createCanonical(200, { confidence: 0.01 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });
        const beforeRecovery = estimator.update({
            canonical: createCanonical(450, { confidence: 0.01 }),
            reliability: createTrackedReliability(450),
            mediaTimeMs: 450,
        });

        const recovered = estimator.update({
            canonical: createCanonical(550, {
                reach: 1.15,
                elevationRad: Math.PI / 2,
                openness: 1,
                forwardness: 1,
                elbowFlexionRad: Math.PI,
                confidence: 1,
            }),
            reliability: createTrackedReliability(550),
            mediaTimeMs: 550,
        });

        expect(recovered.arms.left.state).toBe("recovering");
        expect(recovered.arms.left.source).toBe("mixed");
        expect(recovered.arms.left.recoveringBlend).toMatchObject({
            from: "predicted",
            durationMs: 260,
        });
        expect(recovered.arms.left.warnings).toContain("recovery_blend");
        expect(
            Math.abs(recovered.arms.left.elevationRad - beforeRecovery.arms.left.elevationRad),
        ).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-12);
        expect(
            Math.abs(
                recovered.arms.left.elbowFlexionRad - beforeRecovery.arms.left.elbowFlexionRad,
            ),
        ).toBeLessThanOrEqual((15 * Math.PI) / 180 + 1e-12);
    });

    it("updates prediction independently for left and right arms", () => {
        const estimator = new TemporalStateEstimator();
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });

        const temporal = estimator.update({
            canonical: createCanonical(200, { confidence: 0.01 }, { reach: 0.75 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });

        expect(temporal.arms.left.state).toBe("predicted");
        expect(temporal.arms.right.state).toBe("tracked");
        expect(temporal.arms.right.source).toBe("canonical");
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

    it("restarts classification hold duration after a low-confidence interruption", () => {
        const estimator = new TemporalStateEstimator();

        estimator.update({
            canonical: createCanonical(0, { classification: "front", confidence: 1 }),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        estimator.update({
            canonical: createCanonical(100, { classification: "front", confidence: 1 }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });
        estimator.update({
            canonical: createCanonical(200, { classification: "front", confidence: 0.2 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });

        const temporal = estimator.update({
            canonical: createCanonical(260, { classification: "front", confidence: 1 }),
            reliability: createTrackedReliability(260),
            mediaTimeMs: 260,
        });

        expect(temporal.arms.left.classification).toBe("side");
        expect(temporal.arms.left.warnings).toContain("classification_held");
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
        expect(temporal.arms.left.recoveringBlend).toBeUndefined();
    });

    it("clears prediction and recovery state on reset", () => {
        const estimator = new TemporalStateEstimator(createDefaultTemporalStateEstimatorConfig());
        estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        estimator.update({
            canonical: createCanonical(200, { confidence: 0.01 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });
        estimator.update({
            canonical: createCanonical(300, { reach: 1, confidence: 1 }),
            reliability: createTrackedReliability(300),
            mediaTimeMs: 300,
        });

        estimator.reset();
        const temporal = estimator.update({
            canonical: createCanonical(1000, { reach: 0.7, confidence: 1 }),
            reliability: createTrackedReliability(1000),
            mediaTimeMs: 1000,
        });

        expect(temporal.arms.left.state).toBe("tracked");
        expect(temporal.arms.left.source).toBe("canonical");
        expect(temporal.arms.left.recoveringBlend).toBeUndefined();
        expect(temporal.arms.left.warnings).not.toContain("recovery_blend");
        expect(temporal.arms.left.warnings).not.toContain("prediction_active");
    });

    it("applies the optional head dropout and recovery policy only when canonical head exists", () => {
        const estimator = new TemporalStateEstimator();
        const noHead = estimator.update({
            canonical: createCanonical(0),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });

        expect(noHead.head).toBeUndefined();

        estimator.update({
            canonical: createCanonical(100, {}, {}, { yawRad: 0.1, confidence: 1 }),
            reliability: createTrackedReliability(100),
            mediaTimeMs: 100,
        });
        estimator.update({
            canonical: createCanonical(200, {}, {}, { yawRad: 0.2, confidence: 1 }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });
        const predicted = estimator.update({
            canonical: createCanonical(400, {}, {}, { yawRad: 0, confidence: 0.01 }),
            reliability: createTrackedReliability(400),
            mediaTimeMs: 400,
        });
        const recovering = estimator.update({
            canonical: createCanonical(500, {}, {}, { yawRad: 0.8, confidence: 1 }),
            reliability: createTrackedReliability(500),
            mediaTimeMs: 500,
        });

        expect(predicted.head).toMatchObject({
            state: "predicted",
            source: "predicted",
        });
        expect(predicted.head?.warnings).toEqual(
            expect.arrayContaining(["prediction_active", "velocity_damped"]),
        );
        expect(recovering.head).toMatchObject({
            state: "recovering",
            source: "mixed",
        });
        expect(recovering.head?.warnings).toContain("recovery_blend");
    });
});
