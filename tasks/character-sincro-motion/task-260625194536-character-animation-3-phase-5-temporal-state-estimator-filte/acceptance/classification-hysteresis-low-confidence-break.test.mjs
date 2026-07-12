import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const worktree = process.env.SINCROMISOR_EVAL_WORKTREE;

if (!worktree) {
    throw new Error("SINCROMISOR_EVAL_WORKTREE is required.");
}

const src = `${worktree}/sincromisor-frontend/src/character`;
const { CANONICAL_UPPER_BODY_SCHEMA_VERSION, DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT } =
    await import(pathToFileURL(`${src}/canonical/canonicalUpperBodyState.ts`).href);
const { createDefaultReliabilityMap } = await import(
    pathToFileURL(`${src}/reliability/reliabilityMap.ts`).href
);
const { TemporalStateEstimator } = await import(
    pathToFileURL(`${src}/temporal/temporalStateEstimator.ts`).href
);

const baseMeta = {
    confidence: 1,
    source: "pose",
    warnings: [],
    outOfRangeFields: [],
};

function createArm(overrides = {}) {
    return {
        ...baseMeta,
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

function createCanonical(mediaTimeMs, leftOverrides = {}, rightOverrides = {}) {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs,
            poseLastUpdatedAtMs: mediaTimeMs,
        },
        torso: {
            ...baseMeta,
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

function createTrackedReliability(mediaTimeMs) {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    for (const side of ["left", "right"]) {
        reliability.parts[`${side}Arm`].state = "tracked";
        reliability.joints[`${side}Shoulder`].state = "tracked";
        reliability.joints[`${side}Elbow`].state = "tracked";
        reliability.joints[`${side}Wrist`].state = "tracked";
    }
    return reliability;
}

describe("TemporalStateEstimator acceptance: classification hysteresis", () => {
    it("does not count low-confidence time as continuous candidate hold", () => {
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
        const afterInterruptedHold = estimator.update({
            canonical: createCanonical(260, { classification: "front", confidence: 1 }),
            reliability: createTrackedReliability(260),
            mediaTimeMs: 260,
        });

        expect(afterInterruptedHold.arms.left.classification).toBe("side");
        expect(afterInterruptedHold.arms.left.warnings).toContain("classification_held");
    });
});
