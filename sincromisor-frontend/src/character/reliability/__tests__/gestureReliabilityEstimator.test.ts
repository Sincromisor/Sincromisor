import { describe, expect, it } from "vitest";
import type { SincroHandMotionSnapshot } from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroRoiObservation } from "../../../features/gaze/trackingRuntime/roiTracking/roiTrackingTypes";
import { MotionIntentEstimator } from "../../motionIntent/motionIntentEstimator";
import { createDefaultTemporalUpperBodyState } from "../../temporal/temporalUpperBodyState";
import { createGestureReliability } from "../gestureReliabilityEstimator";
import { createDefaultReliabilityMap, parseReliabilityMap } from "../reliabilityMap";

function createRoi(side: "left" | "right", confidence = 0.82): SincroRoiObservation {
    return {
        side,
        source: "pose-wrist",
        rect: {
            centerX: side === "left" ? 0.3 : 0.7,
            centerY: 0.65,
            width: 0.2,
            height: 0.2,
            clamped: false,
        },
        confidence,
        referencePoint: side === "left" ? [0.3, 0.65] : [0.7, 0.65],
        warnings: [],
    };
}

function createHand(): SincroHandMotionSnapshot {
    const features = {
        palmNormal: [0, 0, 1] as const,
        palmDirection: [0, -1, 0] as const,
        fingerCurl: { thumb: 0.1, index: 0.1, middle: 0.1, ring: 0.1, little: 0.1 },
        fingerSplay: { indexMiddle: 0, middleRing: 0, ringLittle: 0 },
        thumbOppose: 0,
        openness: "open" as const,
    };
    return {
        trackingEnabled: true,
        detected: true,
        leftHand: {
            detected: true,
            assignedSide: "left",
            source: "roi",
            confidence: 0.9,
            handednessScore: 0.95,
            roi: createRoi("left"),
            fullFrameWrist: [0.3, 0.65],
            features,
            warnings: [],
        },
        rightHand: {
            detected: true,
            assignedSide: "right",
            source: "roi",
            confidence: 0.8,
            handednessScore: 0.9,
            roi: createRoi("right"),
            fullFrameWrist: [0.7, 0.65],
            features,
            warnings: [],
        },
        inferenceTimeMs: 4,
        inferenceFps: 4,
    };
}

describe("createGestureReliability", () => {
    it("keeps neutral source when gesture observation is missing", () => {
        const reliability = createGestureReliability({ mediaTimeMs: 100 });

        expect(reliability).toMatchObject({
            source: "neutral",
            finalWeight: 0,
            confidence: 0,
            stableDurationMs: 0,
            warnings: ["no_observation"],
        });
    });

    it("keeps a valid 0ms observation as unstable gesture reliability", () => {
        const reliability = createGestureReliability({
            gesture: {
                left: { label: "Unknown_Label", confidence: 0.91 },
                right: { label: "Open_Palm", confidence: 0.72 },
            },
            hand: createHand(),
            mediaTimeMs: 100,
        });

        expect(reliability).toMatchObject({
            source: "gesture",
            side: "left",
            label: "Unknown_Label",
            confidence: 0.91,
            stableDurationMs: 0,
            finalWeight: 0,
        });
        expect(reliability.components.tracking.score).toBe(0.91);
        expect(reliability.components.temporal).toEqual({
            score: 0,
            reasonCodes: ["unstable_observation"],
        });
        expect(reliability.components.side.score).toBe(1);
        expect(reliability.components.roi.score).toBe(0.82);
    });

    it("maps stable duration boundaries 159ms and 160ms into temporal score", () => {
        const initial = createGestureReliability({
            gesture: { left: { label: "Pointing_Up", confidence: 0.9 } },
            hand: createHand(),
            mediaTimeMs: 100,
        });
        const at159 = createGestureReliability({
            gesture: { left: { label: "Pointing_Up", confidence: 0.9 } },
            hand: createHand(),
            previous: initial,
            mediaTimeMs: 259,
        });
        const at160 = createGestureReliability({
            gesture: { left: { label: "Pointing_Up", confidence: 0.9 } },
            hand: createHand(),
            previous: initial,
            mediaTimeMs: 260,
        });

        expect(at159.components.temporal).toEqual({
            score: 159 / 160,
            reasonCodes: ["unstable_observation"],
        });
        expect(at160.components.temporal).toEqual({ score: 1, reasonCodes: [] });
        expect(at160.finalWeight).toBeCloseTo(
            Math.min(
                at160.components.tracking.score,
                at160.components.temporal.score,
                at160.components.side.score,
                at160.components.roi.score,
                at160.components.cameraQuality.score,
            ),
            6,
        );
    });

    it("accumulates stable duration only for the same side and label", () => {
        const previous = createGestureReliability({
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
            hand: createHand(),
            mediaTimeMs: 100,
        });
        const stable = createGestureReliability({
            gesture: { left: { label: "Open_Palm", confidence: 0.92 } },
            hand: createHand(),
            previous,
            mediaTimeMs: 300,
        });
        const changedSide = createGestureReliability({
            gesture: { right: { label: "Open_Palm", confidence: 0.92 } },
            hand: createHand(),
            previous: stable,
            mediaTimeMs: 360,
        });
        const changedLabel = createGestureReliability({
            gesture: { left: { label: "Pointing_Up", confidence: 0.92 } },
            hand: createHand(),
            previous: stable,
            mediaTimeMs: 360,
        });

        expect(stable.stableDurationMs).toBe(200);
        expect(stable.finalWeight).toBeCloseTo(0.75, 6);
        expect(changedSide.stableDurationMs).toBe(0);
        expect(changedLabel.stableDurationMs).toBe(0);
        expect(changedLabel.source).toBe("gesture");
        expect(changedSide).toMatchObject({
            source: "gesture",
            components: {
                temporal: { score: 0, reasonCodes: ["unstable_observation"] },
            },
        });
    });

    it("resets stability on low confidence or media time regression", () => {
        const previous = createGestureReliability({
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
            hand: createHand(),
            mediaTimeMs: 500,
        });
        const lowConfidence = createGestureReliability({
            gesture: { left: { label: "Open_Palm", confidence: 0.4 } },
            hand: createHand(),
            previous,
            mediaTimeMs: 700,
        });
        const regression = createGestureReliability({
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
            hand: createHand(),
            previous,
            mediaTimeMs: 400,
        });

        expect(lowConfidence.stableDurationMs).toBe(0);
        expect(regression.stableDurationMs).toBe(0);
        expect(lowConfidence.source).toBe("gesture");
        expect(regression.source).toBe("gesture");
        expect(lowConfidence.components.temporal.reasonCodes).toEqual(["unstable_observation"]);
        expect(regression.components.temporal.reasonCodes).toEqual(["unstable_observation"]);
    });

    it("keeps the MotionIntent gesture gate closed until temporal reliability is stable", () => {
        const hand = createHand();
        const estimator = new MotionIntentEstimator({
            timing: { pointing: { minimumDurationMs: 0 } },
        });
        const temporal = createDefaultTemporalUpperBodyState(0);
        temporal.arms.left.state = "tracked";
        temporal.arms.left.source = "canonical";
        temporal.arms.left.confidence = 0.9;
        temporal.arms.left.warnings = [];
        const initialGesture = createGestureReliability({
            gesture: { left: { label: "Pointing_Up", confidence: 0.95 } },
            hand,
            mediaTimeMs: 0,
        });
        const initialMap = { ...createDefaultReliabilityMap(0), gesture: initialGesture };
        initialMap.parts.leftHand.finalWeight = 0.9;
        initialMap.parts.leftFinger.finalWeight = 0.9;
        const initialIntent = estimator.update({
            temporal,
            reliability: initialMap,
            hand,
            gesture: { left: { label: "Pointing_Up", confidence: 0.95 } },
            mediaTimeMs: 0,
        });

        expect(initialIntent.arms.left.intent).not.toBe("pointing");
        expect(initialIntent.arms.left.warnings).toContain("gesture_unstable");

        const stableGesture = createGestureReliability({
            gesture: { left: { label: "Pointing_Up", confidence: 0.95 } },
            hand,
            previous: initialGesture,
            mediaTimeMs: 160,
        });
        temporal.timestamp.mediaTimeMs = 160;
        const stableMap = { ...createDefaultReliabilityMap(160), gesture: stableGesture };
        stableMap.parts.leftHand.finalWeight = 0.9;
        stableMap.parts.leftFinger.finalWeight = 0.9;
        const stableIntent = estimator.update({
            temporal,
            reliability: stableMap,
            hand,
            gesture: { left: { label: "Pointing_Up", confidence: 0.95 } },
            mediaTimeMs: 160,
        });
        expect(stableGesture.finalWeight).toBeGreaterThan(0.65);
        expect(stableIntent.arms.left.intent).toBe("pointing");
    });

    it("stays parseable inside ReliabilityMap without raw category or handedness objects", () => {
        const map = createDefaultReliabilityMap(100);
        const gesture = createGestureReliability({
            gesture: { left: { label: "Open_Palm", confidence: 0.9 } },
            hand: createHand(),
            mediaTimeMs: 100,
        });
        const parsed = parseReliabilityMap({ ...map, gesture });

        expect(parsed.ok).toBe(true);
        expect(JSON.stringify(gesture)).not.toContain("categories");
        expect(JSON.stringify(gesture)).not.toContain("handedness");
    });

    it("parses legacy gesture temporal zero with no_observation under the v1 schema", () => {
        const map = createDefaultReliabilityMap(100);
        map.gesture.components.temporal = { score: 0, reasonCodes: ["no_observation"] };

        expect(parseReliabilityMap(map).ok).toBe(true);
    });
});
