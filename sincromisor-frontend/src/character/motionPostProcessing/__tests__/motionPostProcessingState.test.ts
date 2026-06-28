import { describe, expect, it } from "vitest";
import { createDefaultMotionIntentState } from "../../motionIntent/motionIntentState";
import { createDefaultReliabilityMap } from "../../reliability/reliabilityMap";
import { createDefaultTemporalUpperBodyState } from "../../temporal/temporalUpperBodyState";
import {
    createNoopMotionPostProcessingResult,
    MOTION_POST_PROCESSING_SCHEMA_VERSION,
    type MotionPostProcessingParseResult,
    type MotionPostProcessingResult,
    parseMotionPostProcessingResult,
} from "../motionPostProcessingState";

function expectErrorCode(result: MotionPostProcessingParseResult, code: string, path?: string[]) {
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

function createResult(): MotionPostProcessingResult {
    return createNoopMotionPostProcessingResult({
        temporal: createDefaultTemporalUpperBodyState(240),
        intent: createDefaultMotionIntentState(240),
        reliability: createDefaultReliabilityMap(240),
        mediaTimeMs: 240,
        source: "fixture",
    });
}

describe("createNoopMotionPostProcessingResult", () => {
    it("creates a disabled no-op result without copying input states into output", () => {
        const result = createResult();

        expect(result).toEqual({
            schemaVersion: MOTION_POST_PROCESSING_SCHEMA_VERSION,
            timestamp: { mediaTimeMs: 240 },
            processor: {
                id: "noop",
                version: "v1",
                mode: "disabled",
            },
            inputAvailability: {
                canonical: false,
                temporal: true,
                intent: true,
                reliability: true,
            },
            output: {},
            corrections: [],
            warnings: ["processor_disabled"],
        });
    });
});

describe("parseMotionPostProcessingResult", () => {
    it("accepts a valid no-op result", () => {
        const parsed = parseMotionPostProcessingResult(createResult());

        expect(parsed).toMatchObject({
            ok: true,
            result: {
                schemaVersion: MOTION_POST_PROCESSING_SCHEMA_VERSION,
                output: {},
                corrections: [],
            },
        });
    });

    it("reports unknown schema versions before detailed validation", () => {
        const result = {
            ...createResult(),
            schemaVersion: "sincro.motion-post-processing.v2",
            processor: {
                id: "noop",
                version: "v1",
                mode: "unexpected",
            },
        };

        expect(parseMotionPostProcessingResult(result)).toMatchObject({
            ok: false,
            errors: [{ code: "unknown_schema_version", path: ["schemaVersion"] }],
        });
    });

    it("rejects unknown enum values", () => {
        const result = {
            ...createResult(),
            processor: {
                id: "noop",
                version: "v1",
                mode: "off",
            },
            warnings: ["disabled"],
        };

        expectErrorCode(parseMotionPostProcessingResult(result), "invalid_state", [
            "processor",
            "mode",
        ]);
        expectErrorCode(parseMotionPostProcessingResult(result), "invalid_state", [
            "warnings",
            "0",
        ]);
    });

    it("rejects confidence outside 0..1", () => {
        const result = {
            ...createResult(),
            corrections: [
                {
                    target: "canonical",
                    path: "arms.left.reach",
                    kind: "jitter_smoothing",
                    confidence: 1.01,
                    reasonCode: "neutral_jitter",
                },
            ],
        };

        expectErrorCode(parseMotionPostProcessingResult(result), "out_of_range", [
            "corrections",
            "0",
            "confidence",
        ]);
    });

    it("rejects runtime object shaped correction values", () => {
        const result = {
            ...createResult(),
            corrections: [
                {
                    target: "canonical",
                    path: "arms.left.bodyLocalWrist",
                    kind: "ik_refinement_hint",
                    confidence: 0.4,
                    reasonCode: "solver_limit",
                    previousValue: { x: 0, y: 1, z: 2, isVector3: true },
                    nextValue: { x: 0, y: 0, z: 0, w: 1, isQuaternion: true },
                },
            ],
        };

        expectErrorCode(parseMotionPostProcessingResult(result), "invalid_state", [
            "corrections",
            "0",
            "previousValue",
        ]);
        expectErrorCode(parseMotionPostProcessingResult(result), "invalid_state", [
            "corrections",
            "0",
            "nextValue",
        ]);
    });

    it("rejects Vector3 and Quaternion shaped plain objects", () => {
        const vectorResult = {
            ...createResult(),
            corrections: [
                {
                    target: "canonical",
                    path: "arms.left.bodyLocalWrist",
                    kind: "ik_refinement_hint",
                    confidence: 0.4,
                    reasonCode: "solver_limit",
                    previousValue: { x: 0, y: 1, z: 2 },
                },
            ],
        };
        const quaternionResult = {
            ...createResult(),
            corrections: [
                {
                    target: "canonical",
                    path: "arms.left.rotation",
                    kind: "ik_refinement_hint",
                    confidence: 0.4,
                    reasonCode: "solver_limit",
                    nextValue: { x: 0, y: 0, z: 0, w: 1 },
                },
            ],
        };

        expectErrorCode(parseMotionPostProcessingResult(vectorResult), "invalid_state", [
            "corrections",
            "0",
            "previousValue",
        ]);
        expectErrorCode(parseMotionPostProcessingResult(quaternionResult), "invalid_state", [
            "corrections",
            "0",
            "nextValue",
        ]);
    });

    it("rejects extra keys and function values", () => {
        const result = {
            ...createResult(),
            extra: true,
            corrections: [
                {
                    target: "intent",
                    path: "arms.left.intent",
                    kind: "gesture_sequence_classification",
                    confidence: 0.5,
                    reasonCode: "gesture_flicker",
                    previousValue: () => "wave",
                },
            ],
        };

        expectErrorCode(parseMotionPostProcessingResult(result), "invalid_state", []);
        expectErrorCode(parseMotionPostProcessingResult(result), "invalid_state", [
            "corrections",
            "0",
            "previousValue",
        ]);
    });

    it("rejects class instances", () => {
        class RuntimePostProcessingResult implements MotionPostProcessingResult {
            schemaVersion = MOTION_POST_PROCESSING_SCHEMA_VERSION;
            timestamp = createResult().timestamp;
            processor = createResult().processor;
            inputAvailability = createResult().inputAvailability;
            output = createResult().output;
            corrections = createResult().corrections;
            warnings = createResult().warnings;
        }

        expectErrorCode(
            parseMotionPostProcessingResult(new RuntimePostProcessingResult()),
            "invalid_state",
        );
    });
});
