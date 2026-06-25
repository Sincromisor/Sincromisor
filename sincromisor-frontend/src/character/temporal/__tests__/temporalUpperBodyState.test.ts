import { describe, expect, it } from "vitest";

import {
    createDefaultTemporalUpperBodyState,
    parseTemporalUpperBodyState,
    TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
    type TemporalUpperBodyState,
    type TemporalUpperBodyStateParseResult,
} from "../temporalUpperBodyState";

function expectErrorCode(result: TemporalUpperBodyStateParseResult, code: string, path?: string[]) {
    expect(result.ok).toBe(false);
    if (result.ok) {
        return;
    }
    expect(result.errors).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                code,
                ...(path === undefined ? {} : { path }),
            }),
        ]),
    );
}

function createTemporalState(): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(1234, { includeHead: true });
    temporal.timestamp.canonicalMediaTimeMs = 1220;
    temporal.timestamp.poseLastUpdatedAtMs = 1210;
    temporal.arms.left = {
        ...temporal.arms.left,
        state: "tracked",
        confidence: 0.8,
        source: "canonical",
        stateAgeMs: 80,
        observedAgeMs: 16,
        warnings: [],
        reach: 0.6,
        elevationRad: 0.2,
        openness: -0.1,
        forwardness: 0.7,
        elbowFlexionRad: 1.2,
        classification: "front",
        bodyLocalWrist: [0.2, 0.3, 0.4],
        bodyLocalElbow: [0.1, 0.2, 0.3],
        velocity: {
            wrist: [0.01, 0.02, 0.03],
            reachPerSec: 0.1,
            elevationRadPerSec: 0.2,
            opennessPerSec: -0.1,
            forwardnessPerSec: 0.05,
            elbowFlexionRadPerSec: 0.3,
        },
        recoveringBlend: {
            from: "predicted",
            progress: 0.5,
            durationMs: 240,
        },
    };
    return temporal;
}

describe("createDefaultTemporalUpperBodyState", () => {
    it("creates a lost neutral arm state without head by default", () => {
        const temporal = createDefaultTemporalUpperBodyState(123);

        expect(temporal).toEqual({
            schemaVersion: TEMPORAL_UPPER_BODY_SCHEMA_VERSION,
            timestamp: { mediaTimeMs: 123 },
            arms: {
                left: {
                    state: "lost",
                    confidence: 0,
                    source: "neutral",
                    stateAgeMs: 0,
                    observedAgeMs: 0,
                    warnings: ["dropout"],
                    reach: 0.35,
                    elevationRad: -0.25,
                    openness: 0.15,
                    forwardness: 0.15,
                    elbowFlexionRad: 1.15,
                    classification: "side",
                    velocity: {
                        reachPerSec: 0,
                        elevationRadPerSec: 0,
                        opennessPerSec: 0,
                        forwardnessPerSec: 0,
                        elbowFlexionRadPerSec: 0,
                    },
                },
                right: {
                    state: "lost",
                    confidence: 0,
                    source: "neutral",
                    stateAgeMs: 0,
                    observedAgeMs: 0,
                    warnings: ["dropout"],
                    reach: 0.35,
                    elevationRad: -0.25,
                    openness: 0.15,
                    forwardness: 0.15,
                    elbowFlexionRad: 1.15,
                    classification: "side",
                    velocity: {
                        reachPerSec: 0,
                        elevationRadPerSec: 0,
                        opennessPerSec: 0,
                        forwardnessPerSec: 0,
                        elbowFlexionRadPerSec: 0,
                    },
                },
            },
            warnings: ["dropout"],
        });
        expect(temporal.head).toBeUndefined();
        expect(temporal.arms.left.bodyLocalWrist).toBeUndefined();
        expect(temporal.arms.left.bodyLocalElbow).toBeUndefined();
    });

    it("adds a lost neutral head when requested", () => {
        const temporal = createDefaultTemporalUpperBodyState(123, { includeHead: true });

        expect(temporal.head).toEqual({
            state: "lost",
            confidence: 0,
            source: "neutral",
            stateAgeMs: 0,
            observedAgeMs: 0,
            warnings: ["dropout"],
            yawRad: 0,
            pitchRad: 0,
            rollRad: 0,
            angularVelocityRadPerSec: {
                yaw: 0,
                pitch: 0,
                roll: 0,
            },
        });
    });
});

describe("parseTemporalUpperBodyState", () => {
    it("accepts a valid temporal upper body state", () => {
        const result = parseTemporalUpperBodyState(createTemporalState());

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.state.schemaVersion).toBe(TEMPORAL_UPPER_BODY_SCHEMA_VERSION);
        expect(result.state.arms.left.source).toBe("canonical");
        expect(result.state.arms.left.bodyLocalWrist).toEqual([0.2, 0.3, 0.4]);
        expect(result.state.head?.yawRad).toBe(0);
    });

    it("reports unknown schema versions before detailed validation", () => {
        const temporal = createTemporalState();
        const invalidTemporal = {
            ...temporal,
            schemaVersion: "sincro.temporal-upper-body.v2",
            arms: {
                ...temporal.arms,
                left: {
                    ...temporal.arms.left,
                    confidence: 2,
                },
            },
        };

        expect(parseTemporalUpperBodyState(invalidTemporal)).toMatchObject({
            ok: false,
            errors: [{ code: "unknown_schema_version", path: ["schemaVersion"] }],
        });
    });

    it("rejects non-finite numbers", () => {
        const temporal = createTemporalState();
        const invalidTemporal = {
            ...temporal,
            arms: {
                ...temporal.arms,
                left: {
                    ...temporal.arms.left,
                    velocity: {
                        ...temporal.arms.left.velocity,
                        reachPerSec: Number.NaN,
                    },
                },
            },
        };

        expectErrorCode(parseTemporalUpperBodyState(invalidTemporal), "invalid_state", [
            "arms",
            "left",
            "velocity",
            "reachPerSec",
        ]);
    });

    it("rejects out-of-range confidence and arm scalars", () => {
        const temporal = createTemporalState();
        const invalidTemporal = {
            ...temporal,
            arms: {
                ...temporal.arms,
                left: {
                    ...temporal.arms.left,
                    confidence: -0.01,
                    reach: 1.151,
                },
                right: {
                    ...temporal.arms.right,
                    elbowFlexionRad: Math.PI + 0.01,
                },
            },
        };

        const result = parseTemporalUpperBodyState(invalidTemporal);

        expectErrorCode(result, "out_of_range", ["arms", "left", "confidence"]);
        expectErrorCode(result, "out_of_range", ["arms", "left", "reach"]);
        expectErrorCode(result, "out_of_range", ["arms", "right", "elbowFlexionRad"]);
    });

    it("rejects out-of-range recovering blend progress and duration", () => {
        const temporal = createTemporalState();
        const invalidTemporal = {
            ...temporal,
            arms: {
                ...temporal.arms,
                left: {
                    ...temporal.arms.left,
                    recoveringBlend: {
                        from: "neutral",
                        progress: 1.01,
                        durationMs: 401,
                    },
                },
            },
        };

        const result = parseTemporalUpperBodyState(invalidTemporal);

        expectErrorCode(result, "out_of_range", ["arms", "left", "recoveringBlend", "progress"]);
        expectErrorCode(result, "out_of_range", ["arms", "left", "recoveringBlend", "durationMs"]);
    });

    it("rejects unknown enum values", () => {
        const temporal = createTemporalState();
        const invalidTemporal = {
            ...temporal,
            arms: {
                ...temporal.arms,
                left: {
                    ...temporal.arms.left,
                    state: "Tracked",
                    classification: "behind",
                },
            },
            warnings: ["unknown_warning"],
        };

        const result = parseTemporalUpperBodyState(invalidTemporal);

        expectErrorCode(result, "invalid_state", ["arms", "left", "state"]);
        expectErrorCode(result, "invalid_state", ["arms", "left", "classification"]);
        expectErrorCode(result, "invalid_state", ["warnings", "0"]);
    });

    it("rejects extra keys including VRM pose fields", () => {
        const temporal = createTemporalState();
        const invalidTemporal = {
            ...temporal,
            arms: {
                ...temporal.arms,
                left: {
                    ...temporal.arms.left,
                    quaternion: { x: 0, y: 0, z: 0, w: 1 },
                },
            },
        };

        expectErrorCode(parseTemporalUpperBodyState(invalidTemporal), "invalid_state", [
            "arms",
            "left",
        ]);
    });

    it("rejects class instances even when fields match", () => {
        class RuntimeTemporalUpperBodyState implements TemporalUpperBodyState {
            schemaVersion = TEMPORAL_UPPER_BODY_SCHEMA_VERSION;
            timestamp = createDefaultTemporalUpperBodyState(123).timestamp;
            arms = createDefaultTemporalUpperBodyState(123).arms;
            warnings = createDefaultTemporalUpperBodyState(123).warnings;
        }

        expectErrorCode(
            parseTemporalUpperBodyState(new RuntimeTemporalUpperBodyState()),
            "invalid_state",
        );
    });
});
