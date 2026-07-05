import { describe, expect, it } from "vitest";
import type { SincroHandMotionSnapshot } from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroRoiObservation } from "../../../features/gaze/trackingRuntime/roiTracking/roiTrackingTypes";
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

    it("uses top side confidence and caps the first unstable frame", () => {
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
            finalWeight: 0.5,
        });
        expect(reliability.components.tracking.score).toBe(0.91);
        expect(reliability.components.temporal).toEqual({
            score: 0,
            reasonCodes: ["no_observation"],
        });
        expect(reliability.components.side.score).toBe(1);
        expect(reliability.components.roi.score).toBe(0.82);
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

        expect(stable.stableDurationMs).toBe(200);
        expect(stable.finalWeight).toBeCloseTo(0.75, 6);
        expect(changedSide.stableDurationMs).toBe(0);
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
});
