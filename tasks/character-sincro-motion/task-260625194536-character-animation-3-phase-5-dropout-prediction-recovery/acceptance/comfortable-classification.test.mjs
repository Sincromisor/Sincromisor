import { describe, expect, it } from "vitest";
import path from "node:path";
import { pathToFileURL } from "node:url";

const evalRoot =
    process.env.EVAL_WORKTREE ??
    "/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-69f5ea1994ba-drhiE1";

const temporalModule = await import(
    pathToFileURL(
        path.join(
            evalRoot,
            "sincromisor-frontend/src/character/temporal/temporalStateEstimator.ts",
        ),
    ).href
);
const canonicalModule = await import(
    pathToFileURL(
        path.join(
            evalRoot,
            "sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts",
        ),
    ).href
);
const reliabilityModule = await import(
    pathToFileURL(
        path.join(evalRoot, "sincromisor-frontend/src/character/reliability/reliabilityMap.ts"),
    ).href
);

const { TemporalStateEstimator } = temporalModule;
const { CANONICAL_UPPER_BODY_SCHEMA_VERSION, DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT } =
    canonicalModule;
const { createDefaultReliabilityMap } = reliabilityModule;

const baseMeta = {
    confidence: 1,
    source: "pose",
    warnings: [],
    outOfRangeFields: [],
};

function createArm(overrides = {}) {
    return {
        ...baseMeta,
        reach: 0.8,
        elevationRad: 0.4,
        openness: 0.7,
        forwardness: 0.6,
        elbowFlexionRad: 2.0,
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
    for (const part of ["leftArm", "rightArm"]) {
        reliability.parts[part].state = "tracked";
    }
    for (const joint of [
        "leftShoulder",
        "leftElbow",
        "leftWrist",
        "rightShoulder",
        "rightElbow",
        "rightWrist",
    ]) {
        reliability.joints[joint].state = "tracked";
    }
    return reliability;
}

describe("dropout comfortable fallback acceptance", () => {
    it("forces comfortable arm classification to side instead of preserving a held front classification", () => {
        const estimator = new TemporalStateEstimator();

        estimator.update({
            canonical: createCanonical(0, { classification: "front" }),
            reliability: createTrackedReliability(0),
            mediaTimeMs: 0,
        });
        const committedFront = estimator.update({
            canonical: createCanonical(200, { classification: "front" }),
            reliability: createTrackedReliability(200),
            mediaTimeMs: 200,
        });
        expect(committedFront.arms.left.classification).toBe("front");

        for (const mediaTimeMs of [400, 650, 850]) {
            estimator.update({
                canonical: createCanonical(mediaTimeMs, { confidence: 0.01 }),
                reliability: createTrackedReliability(mediaTimeMs),
                mediaTimeMs,
            });
        }
        const comfortable = estimator.update({
            canonical: createCanonical(950, { confidence: 0.01 }),
            reliability: createTrackedReliability(950),
            mediaTimeMs: 950,
        });

        expect(comfortable.arms.left.source).toBe("comfortable");
        expect(comfortable.arms.left.classification).toBe("side");
    });
});
