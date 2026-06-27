import { describe, expect, it } from "vitest";

import {
    cloneMotionIntentState,
    createDefaultMotionIntentState,
    MOTION_INTENT_SCHEMA_VERSION,
    type MotionIntentParseResult,
    type MotionIntentState,
    parseMotionIntentState,
} from "../motionIntentState";

function expectErrorCode(result: MotionIntentParseResult, code: string, path?: string[]) {
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

function createMotionIntentState(): MotionIntentState {
    const state = createDefaultMotionIntentState(1234);
    return {
        ...state,
        arms: {
            left: {
                ...state.arms.left,
                intent: "wave",
                confidence: 0.84,
                reliability: 0.75,
                expressiveness: 0.6,
                ageMs: 32,
                stableDurationMs: 180,
                cooldownRemainingMs: 0,
                source: "gesture",
                sourceGestureLabel: "Open_Palm",
                warnings: ["gesture_cooldown"],
            },
            right: {
                ...state.arms.right,
                intent: "thumbsUp",
                confidence: 0.7,
                reliability: 0.8,
                expressiveness: 0.5,
                source: "mixed",
                warnings: [],
            },
        },
        torso: {
            intent: "leaning",
            confidence: 0.55,
            source: "temporal",
            warnings: ["low_pose_reliability"],
        },
        warnings: ["low_pose_reliability"],
    };
}

describe("createDefaultMotionIntentState", () => {
    it("creates fallback tracking arms using caller supplied media time", () => {
        const state = createDefaultMotionIntentState(240);

        expect(state).toEqual({
            schemaVersion: MOTION_INTENT_SCHEMA_VERSION,
            timestamp: { mediaTimeMs: 240 },
            arms: {
                left: {
                    intent: "tracking",
                    confidence: 0,
                    reliability: 0,
                    expressiveness: 0,
                    ageMs: 0,
                    stableDurationMs: 0,
                    cooldownRemainingMs: 0,
                    source: "fallback",
                    warnings: ["fallback_active"],
                },
                right: {
                    intent: "tracking",
                    confidence: 0,
                    reliability: 0,
                    expressiveness: 0,
                    ageMs: 0,
                    stableDurationMs: 0,
                    cooldownRemainingMs: 0,
                    source: "fallback",
                    warnings: ["fallback_active"],
                },
            },
            torso: {
                intent: "neutral",
                confidence: 0,
                source: "fallback",
                warnings: ["fallback_active"],
            },
            warnings: ["fallback_active"],
        });
    });
});

describe("parseMotionIntentState", () => {
    it("accepts a valid motion intent state", () => {
        const result = parseMotionIntentState(createMotionIntentState());

        expect(result.ok).toBe(true);
        if (!result.ok) {
            return;
        }
        expect(result.state.schemaVersion).toBe(MOTION_INTENT_SCHEMA_VERSION);
        expect(result.state.arms.left.intent).toBe("wave");
        expect(result.state.arms.left.sourceGestureLabel).toBe("Open_Palm");
        expect(result.state.torso.intent).toBe("leaning");
    });

    it("reports unknown schema versions before detailed validation", () => {
        const state = createMotionIntentState();
        const invalidState = {
            ...state,
            schemaVersion: "sincro.motion-intent.v2",
            arms: {
                ...state.arms,
                left: {
                    ...state.arms.left,
                    confidence: 2,
                },
            },
        };

        expect(parseMotionIntentState(invalidState)).toMatchObject({
            ok: false,
            errors: [{ code: "unknown_schema_version", path: ["schemaVersion"] }],
        });
    });

    it("rejects raw gesture labels and non-contract intent names", () => {
        const state = createMotionIntentState();
        const invalidState = {
            ...state,
            arms: {
                ...state.arms,
                left: {
                    ...state.arms.left,
                    intent: "thumbs_up",
                },
                right: {
                    ...state.arms.right,
                    intent: "openPalm",
                },
            },
            torso: {
                ...state.torso,
                intent: "wave",
            },
        };

        const result = parseMotionIntentState(invalidState);

        expectErrorCode(result, "invalid_state", ["arms", "left", "intent"]);
        expectErrorCode(result, "invalid_state", ["arms", "right", "intent"]);
        expectErrorCode(result, "invalid_state", ["torso", "intent"]);
    });

    it("rejects unknown warning codes", () => {
        const state = createMotionIntentState();
        const invalidState = {
            ...state,
            warnings: ["unknown_warning"],
        };

        expectErrorCode(parseMotionIntentState(invalidState), "invalid_state", ["warnings", "0"]);
    });

    it("rejects out-of-range scalar values", () => {
        const state = createMotionIntentState();
        const invalidState = {
            ...state,
            timestamp: {
                mediaTimeMs: -1,
            },
            arms: {
                ...state.arms,
                left: {
                    ...state.arms.left,
                    confidence: 1.01,
                    reliability: -0.01,
                    ageMs: -1,
                },
                right: {
                    ...state.arms.right,
                    expressiveness: 1.01,
                    stableDurationMs: -1,
                    cooldownRemainingMs: -1,
                },
            },
        };

        const result = parseMotionIntentState(invalidState);

        expectErrorCode(result, "out_of_range", ["timestamp", "mediaTimeMs"]);
        expectErrorCode(result, "out_of_range", ["arms", "left", "confidence"]);
        expectErrorCode(result, "out_of_range", ["arms", "left", "reliability"]);
        expectErrorCode(result, "out_of_range", ["arms", "left", "ageMs"]);
        expectErrorCode(result, "out_of_range", ["arms", "right", "expressiveness"]);
        expectErrorCode(result, "out_of_range", ["arms", "right", "stableDurationMs"]);
        expectErrorCode(result, "out_of_range", ["arms", "right", "cooldownRemainingMs"]);
    });

    it("rejects non-finite numbers and function values", () => {
        const state = createMotionIntentState();
        const invalidState = {
            ...state,
            arms: {
                ...state.arms,
                left: {
                    ...state.arms.left,
                    confidence: Number.NaN,
                },
                right: {
                    ...state.arms.right,
                    sourceGestureLabel: () => "Open_Palm",
                },
            },
        };

        const result = parseMotionIntentState(invalidState);

        expectErrorCode(result, "invalid_state", ["arms", "left", "confidence"]);
        expectErrorCode(result, "invalid_state", ["arms", "right", "sourceGestureLabel"]);
    });

    it("rejects unknown extra keys including Vector3 and Quaternion shaped fields", () => {
        const state = createMotionIntentState();
        const invalidState = {
            ...state,
            arms: {
                ...state.arms,
                left: {
                    ...state.arms.left,
                    vector3: { x: 0, y: 0, z: 0 },
                },
                right: {
                    ...state.arms.right,
                    quaternion: { x: 0, y: 0, z: 0, w: 1 },
                },
            },
        };

        const result = parseMotionIntentState(invalidState);

        expectErrorCode(result, "invalid_state", ["arms", "left"]);
        expectErrorCode(result, "invalid_state", ["arms", "right"]);
    });

    it("rejects class instances even when fields match", () => {
        class RuntimeMotionIntentState implements MotionIntentState {
            schemaVersion = MOTION_INTENT_SCHEMA_VERSION;
            timestamp = createDefaultMotionIntentState(123).timestamp;
            arms = createDefaultMotionIntentState(123).arms;
            torso = createDefaultMotionIntentState(123).torso;
            warnings = createDefaultMotionIntentState(123).warnings;
        }

        expectErrorCode(parseMotionIntentState(new RuntimeMotionIntentState()), "invalid_state");
    });
});

describe("cloneMotionIntentState", () => {
    it("deep clones mutable warning arrays", () => {
        const state = createMotionIntentState();
        const clone = cloneMotionIntentState(state);

        clone.arms.left.warnings.push("fallback_active");
        clone.torso.warnings.push("fallback_active");
        clone.warnings.push("fallback_active");

        expect(state.arms.left.warnings).toEqual(["gesture_cooldown"]);
        expect(state.torso.warnings).toEqual(["low_pose_reliability"]);
        expect(state.warnings).toEqual(["low_pose_reliability"]);
    });
});
