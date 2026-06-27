import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    type SincroHandMotionSnapshot,
    type SincroHandSideSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import { createDefaultReliabilityMap, type ReliabilityMap } from "../../reliability/reliabilityMap";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalArmState,
    type TemporalUpperBodyState,
} from "../../temporal/temporalUpperBodyState";
import {
    createMotionIntentState,
    type GestureIntentObservation,
    MotionIntentEstimator,
} from "../motionIntentEstimator";
import type { ArmMotionIntent } from "../motionIntentState";

type ArmOverrides = Partial<Omit<TemporalArmState, "velocity">> & {
    velocity?: Partial<TemporalArmState["velocity"]>;
};

function createArm(base: TemporalArmState, overrides: ArmOverrides = {}): TemporalArmState {
    return {
        ...base,
        state: overrides.state ?? "tracked",
        confidence: overrides.confidence ?? 0.9,
        observedAgeMs: overrides.observedAgeMs ?? 0,
        stateAgeMs: overrides.stateAgeMs ?? 0,
        source: overrides.source ?? "canonical",
        warnings: overrides.warnings ?? [],
        reach: overrides.reach ?? 0.45,
        elevationRad: overrides.elevationRad ?? 0.1,
        openness: overrides.openness ?? 0.4,
        forwardness: overrides.forwardness ?? 0.2,
        elbowFlexionRad: overrides.elbowFlexionRad ?? 1,
        classification: overrides.classification ?? "front",
        bodyLocalWrist: overrides.bodyLocalWrist,
        bodyLocalElbow: overrides.bodyLocalElbow,
        velocity: {
            ...base.velocity,
            reachPerSec: overrides.velocity?.reachPerSec ?? 0,
            elevationRadPerSec: overrides.velocity?.elevationRadPerSec ?? 0,
            opennessPerSec: overrides.velocity?.opennessPerSec ?? 0,
            forwardnessPerSec: overrides.velocity?.forwardnessPerSec ?? 0,
            elbowFlexionRadPerSec: overrides.velocity?.elbowFlexionRadPerSec ?? 0,
            wrist: overrides.velocity?.wrist,
        },
        recoveringBlend: overrides.recoveringBlend,
    };
}

function createTemporal(input: {
    mediaTimeMs: number;
    left?: ArmOverrides;
    right?: ArmOverrides;
}): TemporalUpperBodyState {
    const base = createDefaultTemporalUpperBodyState(input.mediaTimeMs);
    return {
        ...base,
        timestamp: { mediaTimeMs: input.mediaTimeMs },
        arms: {
            left: createArm(base.arms.left, input.left),
            right: createArm(base.arms.right, input.right),
        },
        warnings: [],
    };
}

function createHandSide(input: {
    side: "left" | "right";
    confidence?: number;
    detected?: boolean;
    wrist?: readonly [number, number];
    warnings?: SincroHandSideSnapshot["warnings"];
}): SincroHandSideSnapshot {
    return {
        detected: input.detected ?? true,
        assignedSide: input.side,
        source: "roi",
        confidence: input.confidence ?? 0.9,
        handednessScore: 0.95,
        fullFrameWrist: input.wrist,
        features: DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
        warnings: input.warnings ?? [],
    };
}

function createHand(
    input: {
        leftConfidence?: number;
        rightConfidence?: number;
        leftDetected?: boolean;
        rightDetected?: boolean;
        leftWrist?: readonly [number, number];
        rightWrist?: readonly [number, number];
        leftWarnings?: SincroHandSideSnapshot["warnings"];
        rightWarnings?: SincroHandSideSnapshot["warnings"];
    } = {},
): SincroHandMotionSnapshot {
    const leftHand = createHandSide({
        side: "left",
        confidence: input.leftConfidence,
        detected: input.leftDetected,
        wrist: input.leftWrist ?? [0.35, 0.4],
        warnings: input.leftWarnings,
    });
    const rightHand = createHandSide({
        side: "right",
        confidence: input.rightConfidence,
        detected: input.rightDetected,
        wrist: input.rightWrist ?? [0.65, 0.4],
        warnings: input.rightWarnings,
    });
    return {
        trackingEnabled: true,
        detected: leftHand.detected || rightHand.detected,
        leftHand,
        rightHand,
        inferenceTimeMs: 4,
        inferenceFps: 30,
    };
}

function createReliability(input: {
    mediaTimeMs: number;
    leftHand?: number;
    rightHand?: number;
    leftFinger?: number;
    rightFinger?: number;
    torso?: number;
    warnings?: ReliabilityMap["warnings"];
}): ReliabilityMap {
    const base = createDefaultReliabilityMap(input.mediaTimeMs);
    return {
        ...base,
        warnings: input.warnings ?? [],
        parts: {
            ...base.parts,
            torso: {
                ...base.parts.torso,
                finalWeight: input.torso ?? 0.9,
                warnings: [],
            },
            leftHand: {
                ...base.parts.leftHand,
                finalWeight: input.leftHand ?? 0.9,
                warnings: [],
            },
            rightHand: {
                ...base.parts.rightHand,
                finalWeight: input.rightHand ?? 0.9,
                warnings: [],
            },
            leftFinger: {
                ...base.parts.leftFinger,
                finalWeight: input.leftFinger ?? 0.9,
                warnings: [],
            },
            rightFinger: {
                ...base.parts.rightFinger,
                finalWeight: input.rightFinger ?? 0.9,
                warnings: [],
            },
        },
    };
}

function updateEstimator(
    estimator: MotionIntentEstimator,
    mediaTimeMs: number,
    input: {
        left?: ArmOverrides;
        right?: ArmOverrides;
        hand?: SincroHandMotionSnapshot;
        reliability?: ReliabilityMap;
        gesture?: GestureIntentObservation;
    },
) {
    return estimator.update({
        temporal: createTemporal({ mediaTimeMs, left: input.left, right: input.right }),
        reliability: input.reliability ?? createReliability({ mediaTimeMs }),
        hand: input.hand ?? createHand(),
        gesture: input.gesture,
        mediaTimeMs,
    });
}

function expectLeftIntentAfterHold(intent: ArmMotionIntent, gesture: string): void {
    const estimator = new MotionIntentEstimator();
    updateEstimator(estimator, 0, {
        gesture: { left: { label: gesture, confidence: 0.9 } },
    });
    const state = updateEstimator(estimator, 250, {
        gesture: { left: { label: gesture, confidence: 0.9 } },
    });
    expect(state.arms.left.intent).toBe(intent);
    expect(state.arms.left.sourceGestureLabel).toBe(gesture);
}

describe("MotionIntentEstimator", () => {
    it("does not emit wave for Open_Palm without velocity alternations", () => {
        const estimator = new MotionIntentEstimator();

        updateEstimator(estimator, 0, {
            left: { velocity: { wrist: [0.1, 0, 0] }, elevationRad: 0.2 },
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
        });
        updateEstimator(estimator, 200, {
            left: { velocity: { wrist: [0.1, 0, 0] }, elevationRad: 0.2 },
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
        });
        const state = updateEstimator(estimator, 400, {
            left: { velocity: { wrist: [0.1, 0, 0] }, elevationRad: 0.2 },
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
        });

        expect(state.arms.left.intent).not.toBe("wave");
        expect(state.arms.left.warnings).toContain("wave_motion_missing");
    });

    it("emits wave after two horizontal velocity sign alternations", () => {
        const estimator = new MotionIntentEstimator();
        const gesture = { left: { label: "Open_Palm", confidence: 0.9 } };

        updateEstimator(estimator, 0, {
            left: { velocity: { wrist: [0.12, 0, 0] }, elevationRad: 0.2 },
            gesture,
        });
        updateEstimator(estimator, 200, {
            left: { velocity: { wrist: [-0.12, 0, 0] }, elevationRad: 0.2 },
            gesture,
        });
        const state = updateEstimator(estimator, 400, {
            left: { velocity: { wrist: [0.12, 0, 0] }, elevationRad: 0.2 },
            gesture,
        });

        expect(state.arms.left.intent).toBe("wave");
        expect(state.arms.left.stableDurationMs).toBe(400);
    });

    it("keeps short gesture flicker as tracking", () => {
        const estimator = new MotionIntentEstimator();

        updateEstimator(estimator, 0, {
            gesture: { left: { label: "Pointing_Up", confidence: 0.9 } },
        });
        const state = updateEstimator(estimator, 100, {
            gesture: { left: { label: "None", confidence: 0.9 } },
        });

        expect(state.arms.left.intent).toBe("tracking");
    });

    it("suppresses re-trigger during side-local cooldown", () => {
        const estimator = new MotionIntentEstimator();
        const gesture = { left: { label: "Open_Palm", confidence: 0.9 } };

        updateEstimator(estimator, 0, {
            left: { velocity: { wrist: [0.12, 0, 0] }, elevationRad: 0.2 },
            gesture,
        });
        updateEstimator(estimator, 200, {
            left: { velocity: { wrist: [-0.12, 0, 0] }, elevationRad: 0.2 },
            gesture,
        });
        expect(
            updateEstimator(estimator, 400, {
                left: { velocity: { wrist: [0.12, 0, 0] }, elevationRad: 0.2 },
                gesture,
            }).arms.left.intent,
        ).toBe("wave");
        updateEstimator(estimator, 500, { gesture: { left: { label: "None", confidence: 1 } } });
        const state = updateEstimator(estimator, 700, {
            left: { velocity: { wrist: [-0.12, 0, 0] }, elevationRad: 0.2 },
            gesture,
        });

        expect(state.arms.left.intent).toBe("tracking");
        expect(state.arms.left.warnings).toContain("gesture_cooldown");
    });

    it("maps approved gesture labels and ignores unknown labels", () => {
        expectLeftIntentAfterHold("pointing", "Pointing_Up");
        expectLeftIntentAfterHold("thumbsUp", "Thumb_Up");
        expectLeftIntentAfterHold("peace", "Victory");
        expectLeftIntentAfterHold("guarded", "Closed_Fist");

        const estimator = new MotionIntentEstimator();
        updateEstimator(estimator, 0, {
            gesture: { left: { label: "ILoveYou", confidence: 1 } },
        });
        const state = updateEstimator(estimator, 250, {
            gesture: { left: { label: "ILoveYou", confidence: 1 } },
        });

        expect(state.arms.left.intent).toBe("tracking");
    });

    it("detects nearFace, clapLike, and guarded threshold candidates", () => {
        const nearFace = new MotionIntentEstimator();
        updateEstimator(nearFace, 0, {
            left: { classification: "front", elevationRad: 0.25, forwardness: 0.5 },
            hand: createHand({ leftConfidence: 0.7 }),
        });
        expect(
            updateEstimator(nearFace, 250, {
                left: { classification: "front", elevationRad: 0.25, forwardness: 0.5 },
                hand: createHand({ leftConfidence: 0.7 }),
            }).arms.left.intent,
        ).toBe("nearFace");

        const clap = new MotionIntentEstimator();
        updateEstimator(clap, 0, {
            left: { velocity: { wrist: [0.1, 0, 0] } },
            right: { velocity: { wrist: [-0.1, 0, 0] } },
            hand: createHand({ leftWrist: [0.45, 0.4], rightWrist: [0.55, 0.4] }),
        });
        expect(
            updateEstimator(clap, 150, {
                left: { velocity: { wrist: [0.1, 0, 0] } },
                right: { velocity: { wrist: [-0.1, 0, 0] } },
                hand: createHand({ leftWrist: [0.45, 0.4], rightWrist: [0.55, 0.4] }),
            }).arms.left.intent,
        ).toBe("clapLike");

        const guarded = new MotionIntentEstimator();
        updateEstimator(guarded, 0, {
            left: { classification: "crossed" },
        });
        expect(
            updateEstimator(guarded, 250, {
                left: { classification: "crossed" },
            }).arms.left.intent,
        ).toBe("guarded");
    });

    it("suppresses semantic intent on low hand reliability", () => {
        const estimator = new MotionIntentEstimator();
        const gesture = { left: { label: "Pointing_Up", confidence: 0.95 } };

        updateEstimator(estimator, 0, {
            reliability: createReliability({ mediaTimeMs: 0, leftHand: 0.2 }),
            gesture,
        });
        const state = updateEstimator(estimator, 250, {
            reliability: createReliability({ mediaTimeMs: 250, leftHand: 0.2 }),
            gesture,
        });

        expect(state.arms.left.intent).toBe("tracking");
        expect(state.arms.left.warnings).toContain("low_hand_reliability");
    });

    it("uses hand confidence when ReliabilityMap is missing", () => {
        const estimator = new MotionIntentEstimator();
        const gesture = { left: { label: "Pointing_Up", confidence: 0.95 } };

        estimator.update({
            temporal: createTemporal({ mediaTimeMs: 0 }),
            hand: createHand({ leftConfidence: 0.8 }),
            gesture,
            mediaTimeMs: 0,
        });
        const state = estimator.update({
            temporal: createTemporal({ mediaTimeMs: 250 }),
            hand: createHand({ leftConfidence: 0.8 }),
            gesture,
            mediaTimeMs: 250,
        });

        expect(state.arms.left.intent).toBe("pointing");
        expect(state.arms.left.warnings).not.toContain("low_hand_reliability");
    });

    it("holds previous semantic during predicted grace and then falls back through lost", () => {
        const estimator = new MotionIntentEstimator();
        const gesture = { left: { label: "Pointing_Up", confidence: 0.95 } };

        updateEstimator(estimator, 0, { gesture });
        expect(updateEstimator(estimator, 250, { gesture }).arms.left.intent).toBe("pointing");

        const held = updateEstimator(estimator, 450, {
            left: { state: "predicted", confidence: 0.05 },
            hand: createHand({ leftDetected: false, leftConfidence: 0 }),
            gesture: { left: { label: "None", confidence: 1 } },
        });
        expect(held.arms.left.intent).toBe("pointing");
        expect(held.arms.left.warnings).not.toContain("fallback_active");

        const lost = updateEstimator(estimator, 1000, {
            left: { state: "lost", confidence: 0.05, observedAgeMs: 800 },
            right: { state: "tracked", confidence: 0.9 },
            reliability: createReliability({ mediaTimeMs: 1000, torso: 0.9 }),
            hand: createHand({ leftDetected: false, leftConfidence: 0 }),
        });
        expect(lost.arms.left.intent).toBe("lost");

        updateEstimator(estimator, 1200, {
            left: { state: "lost", confidence: 0.01, observedAgeMs: 900 },
            right: { state: "lost", confidence: 0.01, observedAgeMs: 900 },
            reliability: createReliability({ mediaTimeMs: 1200, torso: 0.01 }),
            hand: createHand({ leftDetected: false, rightDetected: false }),
        });
        updateEstimator(estimator, 1400, {
            left: { state: "lost", confidence: 0.01, observedAgeMs: 1100 },
            right: { state: "lost", confidence: 0.01, observedAgeMs: 1100 },
            reliability: createReliability({ mediaTimeMs: 1400, torso: 0.01 }),
            hand: createHand({ leftDetected: false, rightDetected: false }),
        });
        const fallback = updateEstimator(estimator, 1500, {
            left: { state: "lost", confidence: 0.01, observedAgeMs: 1200 },
            right: { state: "lost", confidence: 0.01, observedAgeMs: 1200 },
            reliability: createReliability({ mediaTimeMs: 1500, torso: 0.01 }),
            hand: createHand({ leftDetected: false, rightDetected: false }),
        });

        expect(fallback.arms.left.intent).toBe("fallback");
        expect(fallback.arms.right.intent).toBe("fallback");
    });

    it.each([
        "predicted",
        "recovering",
    ] as const)("prioritizes %s semantic hold over all-arms fallback", (state) => {
        const estimator = new MotionIntentEstimator();
        const gestures = {
            left: { label: "Pointing_Up", confidence: 0.95 },
            right: { label: "Thumb_Up", confidence: 0.95 },
        };

        updateEstimator(estimator, 0, { gesture: gestures });
        const semantic = updateEstimator(estimator, 250, { gesture: gestures });
        expect(semantic.arms.left.intent).toBe("pointing");
        expect(semantic.arms.right.intent).toBe("thumbsUp");

        const lowConfidenceInput = {
            left: { state, confidence: 0.05 },
            right: { state, confidence: 0.05 },
            hand: createHand({
                leftDetected: false,
                rightDetected: false,
                leftConfidence: 0,
                rightConfidence: 0,
            }),
            reliability: createReliability({ mediaTimeMs: 450, torso: 0.01 }),
            gesture: {
                left: { label: "None", confidence: 1 },
                right: { label: "None", confidence: 1 },
            },
        };

        updateEstimator(estimator, 450, lowConfidenceInput);
        updateEstimator(estimator, 650, {
            ...lowConfidenceInput,
            reliability: createReliability({ mediaTimeMs: 650, torso: 0.01 }),
        });
        const held = updateEstimator(estimator, 750, {
            ...lowConfidenceInput,
            reliability: createReliability({ mediaTimeMs: 750, torso: 0.01 }),
        });

        expect(held.arms.left.intent).toBe("pointing");
        expect(held.arms.right.intent).toBe("thumbsUp");
        expect(held.arms.left.warnings).not.toContain("fallback_active");
        expect(held.arms.right.warnings).not.toContain("fallback_active");

        const expired = updateEstimator(estimator, 1000, {
            ...lowConfidenceInput,
            reliability: createReliability({ mediaTimeMs: 1000, torso: 0.01 }),
        });

        expect(expired.arms.left.intent).toBe("fallback");
        expect(expired.arms.right.intent).toBe("fallback");
        expect(expired.arms.left.warnings).toContain("fallback_active");
        expect(expired.arms.right.warnings).toContain("fallback_active");
    });

    it("resets hysteresis and returns invalid_dt without advancing counters", () => {
        const estimator = new MotionIntentEstimator();
        const gesture = { left: { label: "Pointing_Up", confidence: 0.95 } };

        updateEstimator(estimator, 0, { gesture });
        const invalid = updateEstimator(estimator, 400, { gesture });
        expect(invalid.arms.left.intent).toBe("tracking");
        expect(invalid.warnings).toContain("invalid_dt");

        estimator.reset();
        const afterReset = updateEstimator(estimator, 800, { gesture });
        expect(afterReset.arms.left.intent).toBe("tracking");
        expect(afterReset.warnings).not.toContain("invalid_dt");
    });

    it("normalizes config overrides by clamping invalid thresholds and durations", () => {
        const defaultThreshold = new MotionIntentEstimator({
            thresholds: { gestureConfidence: Number.POSITIVE_INFINITY },
        });
        const lowConfidenceGesture = { left: { label: "Pointing_Up", confidence: 0.65 } };
        updateEstimator(defaultThreshold, 0, { gesture: lowConfidenceGesture });
        expect(
            updateEstimator(defaultThreshold, 250, { gesture: lowConfidenceGesture }).arms.left
                .intent,
        ).toBe("tracking");

        const overridden = new MotionIntentEstimator({
            thresholds: { gestureConfidence: 0.5 },
            timing: { pointing: { minimumDurationMs: -20 } },
        });
        updateEstimator(overridden, 0, { gesture: lowConfidenceGesture });
        expect(
            updateEstimator(overridden, 1, { gesture: lowConfidenceGesture }).arms.left.intent,
        ).toBe("pointing");
    });

    it("does not fire minimum-duration semantic intent from one-shot helper", () => {
        const state = createMotionIntentState({
            temporal: createTemporal({ mediaTimeMs: 0 }),
            reliability: createReliability({ mediaTimeMs: 0 }),
            hand: createHand(),
            gesture: { left: { label: "Pointing_Up", confidence: 1 } },
            mediaTimeMs: 0,
        });

        expect(state.arms.left.intent).toBe("tracking");
    });

    it("keeps previous side semantic during side swap suspicion", () => {
        const estimator = new MotionIntentEstimator();
        const pointing = { left: { label: "Pointing_Up", confidence: 0.95 } };

        updateEstimator(estimator, 0, { gesture: pointing });
        expect(updateEstimator(estimator, 250, { gesture: pointing }).arms.left.intent).toBe(
            "pointing",
        );
        const state = updateEstimator(estimator, 450, {
            reliability: createReliability({
                mediaTimeMs: 450,
                warnings: ["side_inconsistent"],
            }),
            gesture: { right: { label: "Thumb_Up", confidence: 1 } },
        });

        expect(state.arms.left.intent).toBe("pointing");
        expect(state.arms.left.warnings).toContain("left_right_swap_suspect");
    });
});
