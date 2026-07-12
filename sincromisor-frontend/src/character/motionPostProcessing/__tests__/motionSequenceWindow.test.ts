import { describe, expect, it } from "vitest";
import {
    cloneSincroHandMotionSnapshot,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    type ArmMotionIntent,
    createDefaultMotionIntentState,
    type MotionIntentState,
} from "../../motionIntent/motionIntentState";
import { createDefaultReliabilityMap, type ReliabilityMap } from "../../reliability/reliabilityMap";
import {
    createDefaultTemporalUpperBodyState,
    type TemporalUpperBodyState,
} from "../../temporal/temporalUpperBodyState";
import { type MotionSequenceSample, MotionSequenceWindow } from "../motionSequenceWindow";

type Side = "left" | "right";
type Openness = "open" | "half" | "closed" | "unknown";

function createTemporal(
    mediaTimeMs: number,
    input: { side?: Side; state?: "tracked" | "lost"; wristX?: number } = {},
): TemporalUpperBodyState {
    const temporal = createDefaultTemporalUpperBodyState(mediaTimeMs);
    const side = input.side ?? "left";
    temporal.arms.left.state = "tracked";
    temporal.arms.right.state = "tracked";
    temporal.arms.left.warnings = [];
    temporal.arms.right.warnings = [];
    temporal.arms[side].state = input.state ?? "tracked";
    if (input.wristX !== undefined) {
        temporal.arms[side].velocity.wrist = [input.wristX, 0, 0];
    }
    temporal.warnings = [];
    return temporal;
}

function createIntent(
    mediaTimeMs: number,
    input: {
        side?: Side;
        intent?: ArmMotionIntent;
        stableDurationMs?: number;
        swap?: boolean;
    } = {},
): MotionIntentState {
    const intent = createDefaultMotionIntentState(mediaTimeMs);
    const side = input.side ?? "left";
    intent.arms.left.warnings = [];
    intent.arms.right.warnings = [];
    intent.arms.left.intent = "tracking";
    intent.arms.right.intent = "tracking";
    intent.arms[side].intent = input.intent ?? "tracking";
    intent.arms[side].stableDurationMs = input.stableDurationMs ?? 0;
    intent.arms[side].warnings = input.swap === true ? ["left_right_swap_suspect"] : [];
    intent.warnings = [];
    intent.torso.warnings = [];
    return intent;
}

function createReliability(
    mediaTimeMs: number,
    input: {
        side?: Side;
        state?: "tracked" | "lost";
        topSwap?: boolean;
        partSwap?: boolean;
        jointSwap?: boolean;
    } = {},
): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    const side = input.side ?? "left";
    const partName = side === "left" ? "leftArm" : "rightArm";
    const jointNames =
        side === "left"
            ? (["leftShoulder", "leftElbow", "leftWrist"] as const)
            : (["rightShoulder", "rightElbow", "rightWrist"] as const);

    reliability.warnings = input.topSwap === true ? ["side_inconsistent"] : [];
    reliability.parts.leftArm.state = "tracked";
    reliability.parts.rightArm.state = "tracked";
    reliability.parts.leftArm.warnings = [];
    reliability.parts.rightArm.warnings = [];
    reliability.parts[partName].state = input.state ?? "tracked";
    reliability.parts[partName].warnings = input.partSwap === true ? ["side_inconsistent"] : [];
    for (const jointName of jointNames) {
        reliability.joints[jointName].state = "tracked";
        reliability.joints[jointName].warnings =
            input.jointSwap === true ? ["side_inconsistent"] : [];
    }
    return reliability;
}

function createHand(openness: Openness, side: Side = "left"): SincroHandMotionSnapshot {
    const hand = cloneSincroHandMotionSnapshot(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT);
    if (side === "left") {
        hand.leftHand.features.openness = openness;
    } else {
        hand.rightHand.features.openness = openness;
    }
    return hand;
}

describe("MotionSequenceWindow", () => {
    it("evicts samples by duration", () => {
        const window = new MotionSequenceWindow({ maxDurationMs: 150, maxSamples: 90 });

        window.add({ mediaTimeMs: 0 });
        window.add({ mediaTimeMs: 100 });
        const snapshot = window.add({ mediaTimeMs: 200 });

        expect(snapshot.startMediaTimeMs).toBe(100);
        expect(snapshot.endMediaTimeMs).toBe(200);
        expect(snapshot.sampleCount).toBe(2);
    });

    it("evicts samples by count", () => {
        const window = new MotionSequenceWindow({ maxDurationMs: 1200, maxSamples: 2 });

        window.add({ mediaTimeMs: 0 });
        window.add({ mediaTimeMs: 10 });
        const snapshot = window.add({ mediaTimeMs: 20 });

        expect(snapshot.startMediaTimeMs).toBe(10);
        expect(snapshot.sampleCount).toBe(2);
    });

    it("resets on non-monotonic media time and keeps a warning", () => {
        const window = new MotionSequenceWindow();

        window.add({ mediaTimeMs: 100 });
        const snapshot = window.add({ mediaTimeMs: 50 });

        expect(snapshot.startMediaTimeMs).toBe(50);
        expect(snapshot.sampleCount).toBe(1);
        expect(snapshot.warnings).toEqual(["non_monotonic_time_reset"]);
    });

    it("aggregates sequence features from valid low-dimensional inputs only", () => {
        const window = new MotionSequenceWindow();
        const samples: MotionSequenceSample[] = [
            {
                mediaTimeMs: 0,
                temporal: createTemporal(0, { wristX: 0.03 }),
                intent: createIntent(0, { intent: "wave", stableDurationMs: 80 }),
                reliability: createReliability(0, { topSwap: true }),
                hand: createHand("open"),
            },
            {
                mediaTimeMs: 100,
                temporal: createTemporal(100, { state: "lost", wristX: -0.03 }),
                intent: createIntent(100, { intent: "tracking" }),
                reliability: createReliability(100, { partSwap: true }),
                hand: createHand("half"),
            },
            {
                mediaTimeMs: 250,
                temporal: createTemporal(250, { wristX: 0.04 }),
                intent: createIntent(250, { intent: "pointing", stableDurationMs: 240 }),
                reliability: createReliability(250, { state: "lost", jointSwap: true }),
                hand: createHand("closed"),
            },
            {
                mediaTimeMs: 400,
                temporal: createTemporal(400),
                intent: createIntent(400, { intent: "pointing", stableDurationMs: 390 }),
                reliability: createReliability(400),
                hand: createHand("open"),
            },
        ];

        for (const sample of samples) {
            window.add(sample);
        }
        const left = window.snapshot().features.left;

        expect(left).toEqual({
            intentTransitions: 2,
            semanticHoldMs: 150,
            stableSemanticIntent: "pointing",
            gestureFlickerCount: 1,
            trackingLossMs: 300,
            sideSwapSuspectCount: 3,
            wristVelocitySignChanges: 2,
            handOpenCloseTransitions: 2,
        });
    });

    it("reports input availability per sequence input type", () => {
        const window = new MotionSequenceWindow();

        window.add({ mediaTimeMs: 0, temporal: createTemporal(0) });
        window.add({ mediaTimeMs: 10, intent: createIntent(10) });
        window.add({
            mediaTimeMs: 20,
            reliability: createReliability(20),
            hand: createHand("open"),
        });

        expect(window.snapshot().inputAvailability).toEqual({
            temporal: true,
            intent: true,
            reliability: true,
            hand: true,
        });
    });

    it("keeps raw runtime objects outside MotionSequenceSample", () => {
        const window = new MotionSequenceWindow();

        window.add({ mediaTimeMs: 0 });
        window.add({
            mediaTimeMs: 1,
            // @ts-expect-error reason: raw browser frames are not part of MotionSequenceSample / 解消条件: sequence sample contract changes.
            videoFrame: {},
        });
        window.add({
            mediaTimeMs: 2,
            // @ts-expect-error reason: raw Three.js-like objects are not part of MotionSequenceSample / 解消条件: sequence sample contract changes.
            object3d: { isObject3D: true },
        });
    });
});
