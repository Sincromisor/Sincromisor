import { describe, expect, it } from "vitest";

import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    type CanonicalUpperBodyStateParseErrorCode,
    type CanonicalUpperBodyStateParseResult,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
    parseCanonicalUpperBodyState,
} from "../canonicalUpperBodyState";

const BASE_META: CanonicalPartMeta = {
    confidence: 1,
    source: "pose",
    warnings: [],
    outOfRangeFields: [],
};

function createArmState(overrides: Partial<CanonicalArmState> = {}): CanonicalArmState {
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

function createCanonicalState(): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs: 1234,
            poseLastUpdatedAtMs: 1200,
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
        head: {
            ...BASE_META,
            source: "face",
            yawRad: 0,
            pitchRad: 0,
            rollRad: 0,
        },
        arms: {
            left: createArmState(),
            right: createArmState({ source: "hand", classification: "side" }),
        },
        calibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        warnings: [],
    };
}

function expectErrorCode(
    result: CanonicalUpperBodyStateParseResult,
    code: CanonicalUpperBodyStateParseErrorCode,
) {
    expect(result.ok).toBe(false);
    if (result.ok) {
        return;
    }
    expect(result.errors.map((error) => error.code)).toContain(code);
}

describe("parseCanonicalUpperBodyState", () => {
    it("accepts a valid canonical upper body state", () => {
        const canonical = createCanonicalState();

        const result = parseCanonicalUpperBodyState(canonical);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.state.schemaVersion).toBe(CANONICAL_UPPER_BODY_SCHEMA_VERSION);
        expect(result.state.calibration).toEqual(DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT);
        expect(result.state.arms.left.classification).toBe("front");
    });

    it("reports unknown schema versions before generic schema validation", () => {
        const canonical = {
            ...createCanonicalState(),
            schemaVersion: "sincro.canonical-upper-body.v2",
            torso: {
                ...createCanonicalState().torso,
                shoulderWidth: -1,
            },
        };

        expect(parseCanonicalUpperBodyState(canonical)).toMatchObject({
            ok: false,
            errors: [{ code: "unknown_schema_version", path: ["schemaVersion"] }],
        });
    });

    it("rejects out-of-range arm scalars", () => {
        const canonical = createCanonicalState();
        canonical.arms.left = createArmState({ reach: 1.151 });

        const result = parseCanonicalUpperBodyState(canonical);

        expectErrorCode(result, "out_of_range");
        if (result.ok) {
            return;
        }
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "out_of_range",
                    path: ["arms", "left", "reach"],
                }),
            ]),
        );
    });

    it("rejects non-finite numbers as invalid state", () => {
        const canonical = createCanonicalState();
        canonical.torso.bodyFront = [0, Number.POSITIVE_INFINITY, 1];

        expectErrorCode(parseCanonicalUpperBodyState(canonical), "invalid_state");
    });

    it("classifies tuple length mismatches as invalid state", () => {
        const canonical = createCanonicalState();
        const invalidCanonical = {
            ...canonical,
            torso: {
                ...canonical.torso,
                bodyFront: [0, 0],
            },
        };

        const result = parseCanonicalUpperBodyState(invalidCanonical);

        expectErrorCode(result, "invalid_state");
        if (result.ok) {
            return;
        }
        expect(result.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    code: "invalid_state",
                    path: ["torso", "bodyFront"],
                }),
            ]),
        );
    });

    it("rejects runtime object style extra keys", () => {
        const canonical = createCanonicalState();
        const withRuntimeObject = {
            ...canonical,
            arms: {
                ...canonical.arms,
                left: {
                    ...canonical.arms.left,
                    quaternion: { x: 0, y: 0, z: 0, w: 1 },
                },
            },
        };

        expectErrorCode(parseCanonicalUpperBodyState(withRuntimeObject), "invalid_state");
    });
});
