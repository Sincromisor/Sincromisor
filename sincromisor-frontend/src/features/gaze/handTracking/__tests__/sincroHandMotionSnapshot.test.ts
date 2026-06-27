import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandFeatureSnapshot,
    type SincroHandMotionSnapshot,
} from "../sincroHandMotionSnapshot";
import {
    assignSincroHandObservationsToPose,
    determineSincroHandOpenness,
    restoreHandLandmarksToFullFrame,
    type SincroHandObservation,
} from "../sincroHandTrackerHelpers";

function createLandmark(x: number, y: number, z = 0): NormalizedLandmark {
    return {
        x,
        y,
        z,
        visibility: 1,
    };
}

function createLandmarks(): NormalizedLandmark[] {
    return Array.from({ length: 21 }, () => createLandmark(0.5, 0.5));
}

function createObservation(input: {
    handIndex: number;
    wrist: readonly [number, number];
    confidence?: number;
}): SincroHandObservation {
    const confidence = input.confidence ?? 0.9;
    return {
        handIndex: input.handIndex,
        wrist: input.wrist,
        confidence,
        handednessLabel: input.handIndex === 0 ? "Left" : "Right",
        handednessScore: confidence,
        features: {
            ...DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
            fingerCurl: { ...DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT.fingerCurl },
            fingerSplay: { ...DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT.fingerSplay },
            openness: "open",
        },
        warnings: [],
    };
}

function curl(value: number): SincroHandFeatureSnapshot["fingerCurl"] {
    return {
        thumb: value,
        index: value,
        middle: value,
        ring: value,
        little: value,
    };
}

describe("Sincro hand motion snapshot", () => {
    it("restores ROI-local hand landmarks to full-frame normalized coordinates", () => {
        const landmarks = createLandmarks();
        landmarks[0] = createLandmark(0.25, 0.75, 0.1);

        const restored = restoreHandLandmarksToFullFrame({
            landmarks,
            roi: {
                centerX: 0.4,
                centerY: 0.6,
                width: 0.2,
                height: 0.4,
                clamped: false,
            },
        });

        expect(restored).toBeDefined();
        expect(restored?.warnings).toEqual([]);
        expect(restored?.landmarks[0]?.x).toBeCloseTo(0.35);
        expect(restored?.landmarks[0]?.y).toBeCloseTo(0.7);
        expect(restored?.landmarks[0]?.z).toBeCloseTo(0.1);
    });

    it("assigns full-frame hands by Pose wrist distance before handedness labels", () => {
        const assignment = assignSincroHandObservationsToPose({
            observations: [
                createObservation({ handIndex: 0, wrist: [0.78, 0.5] }),
                createObservation({ handIndex: 1, wrist: [0.22, 0.5] }),
            ],
            leftWrist: { side: "left", point: [0.2, 0.5], confidence: 0.9 },
            rightWrist: { side: "right", point: [0.8, 0.5], confidence: 0.9 },
            source: "full-frame-fallback",
        });

        expect(assignment.leftHand.detected).toBe(true);
        expect(assignment.leftHand.fullFrameWrist).toEqual([0.22, 0.5]);
        expect(assignment.leftHand.handednessLabel).toBe("Right");
        expect(assignment.rightHand.detected).toBe(true);
        expect(assignment.rightHand.fullFrameWrist).toEqual([0.78, 0.5]);
        expect(assignment.rightHand.handednessLabel).toBe("Left");
    });

    it("rejects duplicate assignment of the same hand result to both sides", () => {
        const assignment = assignSincroHandObservationsToPose({
            observations: [createObservation({ handIndex: 0, wrist: [0.5, 0.5] })],
            leftWrist: { side: "left", point: [0.5, 0.5], confidence: 0.9 },
            rightWrist: { side: "right", point: [0.5, 0.5], confidence: 0.9 },
            source: "full-frame-fallback",
        });

        expect(assignment.leftHand.detected).toBe(true);
        expect(assignment.rightHand.detected).toBe(false);
        expect(assignment.rightHand.warnings).toContain("duplicate_assignment");
    });

    it("prefers previous assignment when a full-frame hand is equally close to both wrists", () => {
        const previous: SincroHandMotionSnapshot = {
            ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
            rightHand: {
                ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.rightHand,
                detected: true,
                fullFrameWrist: [0.5, 0.5],
            },
        };

        const assignment = assignSincroHandObservationsToPose({
            observations: [createObservation({ handIndex: 0, wrist: [0.5, 0.5] })],
            leftWrist: { side: "left", point: [0.5, 0.5], confidence: 0.9 },
            rightWrist: { side: "right", point: [0.5, 0.5], confidence: 0.9 },
            source: "full-frame-fallback",
            previous,
        });

        expect(assignment.leftHand.detected).toBe(false);
        expect(assignment.leftHand.warnings).toContain("duplicate_assignment");
        expect(assignment.rightHand.detected).toBe(true);
    });

    it("keeps default lost hands low-dimensional and unknown openness", () => {
        expect(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.detected).toBe(false);
        expect(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand).toMatchObject({
            detected: false,
            source: "lost",
            confidence: 0,
            handednessScore: 0,
            warnings: ["landmarks_missing"],
        });
        expect(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand.fullFrameWrist).toBeUndefined();
        expect(DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT.leftHand.features).toEqual({
            palmNormal: [0, 0, 1],
            palmDirection: [0, -1, 0],
            fingerCurl: {
                thumb: 0,
                index: 0,
                middle: 0,
                ring: 0,
                little: 0,
            },
            fingerSplay: {
                indexMiddle: 0,
                middleRing: 0,
                ringLittle: 0,
            },
            thumbOppose: 0,
            openness: "unknown",
        });
    });

    it("uses fixed openness boundaries from average finger curl", () => {
        expect(
            determineSincroHandOpenness({
                fingerCurl: curl(0.35),
                confidence: 0.9,
            }),
        ).toBe("open");
        expect(
            determineSincroHandOpenness({
                fingerCurl: curl(0.36),
                confidence: 0.9,
            }),
        ).toBe("half");
        expect(
            determineSincroHandOpenness({
                fingerCurl: curl(0.72),
                confidence: 0.9,
            }),
        ).toBe("closed");
        expect(
            determineSincroHandOpenness({
                fingerCurl: curl(0.2),
                confidence: 0.19,
            }),
        ).toBe("unknown");
        expect(
            determineSincroHandOpenness({
                fingerCurl: curl(0.2),
                confidence: 0.9,
                landmarksMissing: true,
            }),
        ).toBe("unknown");
    });
});
