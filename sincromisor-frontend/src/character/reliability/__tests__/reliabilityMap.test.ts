import { describe, expect, it } from "vitest";

import {
    createDefaultReliabilityMap,
    parseReliabilityMap,
    RELIABILITY_MAP_SCHEMA_VERSION,
    type ReliabilityMap,
    type ReliabilityMapParseResult,
} from "../reliabilityMap";

function expectErrorCode(result: ReliabilityMapParseResult, code: string, path?: string[]) {
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

describe("createDefaultReliabilityMap", () => {
    it("creates a lost neutral snapshot", () => {
        const reliability = createDefaultReliabilityMap(123);

        expect(reliability).toMatchObject({
            schemaVersion: RELIABILITY_MAP_SCHEMA_VERSION,
            timestamp: { mediaTimeMs: 123 },
            camera: {
                videoWidth: 0,
                videoHeight: 0,
                cameraQualityScore: 0,
                cameraQualityStatus: "unknown",
                reasonCodes: ["no_observation"],
            },
            gesture: {
                state: "lost",
                finalWeight: 0,
                source: "neutral",
                confidence: 0,
                stableDurationMs: 0,
                warnings: ["no_observation"],
            },
            warnings: ["no_observation"],
        });
        expect(Object.keys(reliability.joints).sort()).toEqual([
            "head",
            "leftElbow",
            "leftHand",
            "leftShoulder",
            "leftWrist",
            "rightElbow",
            "rightHand",
            "rightShoulder",
            "rightWrist",
        ]);
        expect(Object.keys(reliability.parts).sort()).toEqual([
            "head",
            "leftArm",
            "leftFinger",
            "leftHand",
            "rightArm",
            "rightFinger",
            "rightHand",
            "torso",
        ]);
        for (const joint of Object.values(reliability.joints)) {
            expect(joint).toMatchObject({
                state: "lost",
                finalWeight: 0,
                source: "neutral",
                warnings: ["no_observation"],
            });
            for (const component of Object.values(joint.components)) {
                expect(component).toEqual({
                    score: 0,
                    reasonCodes: ["no_observation"],
                });
            }
        }
        for (const part of Object.values(reliability.parts)) {
            expect(part).toMatchObject({
                state: "lost",
                finalWeight: 0,
                source: "neutral",
                warnings: ["no_observation"],
            });
        }
    });
});

describe("parseReliabilityMap", () => {
    it("accepts a valid reliability map", () => {
        const reliability = createDefaultReliabilityMap(123);
        reliability.joints.leftWrist.finalWeight = 0.1;
        reliability.joints.leftWrist.components.tracking.score = 0.2;

        const result = parseReliabilityMap(reliability);

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.map.joints.leftWrist.finalWeight).toBe(0.1);
        expect(result.map.joints.leftWrist.components.tracking.score).toBe(0.2);
    });

    it("reports unknown schema versions before detailed validation", () => {
        const reliability = createDefaultReliabilityMap(123);
        const invalidReliability = {
            ...reliability,
            schemaVersion: "sincro.reliability-map.v2",
            joints: {
                ...reliability.joints,
                leftWrist: {
                    ...reliability.joints.leftWrist,
                    finalWeight: 2,
                },
            },
        };

        expect(parseReliabilityMap(invalidReliability)).toMatchObject({
            ok: false,
            errors: [{ code: "unknown_schema_version", path: ["schemaVersion"] }],
        });
    });

    it("rejects non-finite numbers", () => {
        const reliability = createDefaultReliabilityMap(123);
        const invalidReliability = {
            ...reliability,
            timestamp: {
                mediaTimeMs: Number.POSITIVE_INFINITY,
            },
        };

        expectErrorCode(parseReliabilityMap(invalidReliability), "invalid_state", [
            "timestamp",
            "mediaTimeMs",
        ]);
    });

    it("rejects out-of-range final weights", () => {
        const reliability = createDefaultReliabilityMap(123);
        reliability.joints.leftWrist.finalWeight = 1.01;

        expectErrorCode(parseReliabilityMap(reliability), "out_of_range", [
            "joints",
            "leftWrist",
            "finalWeight",
        ]);
    });

    it("rejects out-of-range component scores", () => {
        const reliability = createDefaultReliabilityMap(123);
        reliability.parts.leftArm.components.tracking.score = -0.01;

        expectErrorCode(parseReliabilityMap(reliability), "out_of_range", [
            "parts",
            "leftArm",
            "components",
            "tracking",
            "score",
        ]);
    });

    it("rejects unknown part states", () => {
        const reliability = createDefaultReliabilityMap(123);
        const invalidReliability = {
            ...reliability,
            gesture: {
                ...reliability.gesture,
                state: "missing",
            },
        };

        expectErrorCode(parseReliabilityMap(invalidReliability), "invalid_state", [
            "gesture",
            "state",
        ]);
    });

    it("rejects extra joint keys", () => {
        const reliability = createDefaultReliabilityMap(123);
        const invalidReliability = {
            ...reliability,
            joints: {
                ...reliability.joints,
                leftKnee: reliability.joints.leftWrist,
            },
        };

        expectErrorCode(parseReliabilityMap(invalidReliability), "invalid_state", ["joints"]);
    });

    it("rejects unknown reason and warning codes", () => {
        const reliability = createDefaultReliabilityMap(123);
        const invalidReliability = {
            ...reliability,
            camera: {
                ...reliability.camera,
                reasonCodes: ["unknown_reason"],
            },
            warnings: ["unknown_warning"],
        };

        const result = parseReliabilityMap(invalidReliability);

        expectErrorCode(result, "invalid_state", ["camera", "reasonCodes", "0"]);
        expectErrorCode(result, "invalid_state", ["warnings", "0"]);
    });

    it("rejects class instances even when fields match", () => {
        class RuntimeReliabilityMap implements ReliabilityMap {
            schemaVersion = RELIABILITY_MAP_SCHEMA_VERSION;
            timestamp = createDefaultReliabilityMap(123).timestamp;
            camera = createDefaultReliabilityMap(123).camera;
            joints = createDefaultReliabilityMap(123).joints;
            parts = createDefaultReliabilityMap(123).parts;
            gesture = createDefaultReliabilityMap(123).gesture;
            warnings = createDefaultReliabilityMap(123).warnings;
        }

        expectErrorCode(parseReliabilityMap(new RuntimeReliabilityMap()), "invalid_state");
    });
});
