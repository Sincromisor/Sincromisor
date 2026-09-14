import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it } from "vitest";
import { assignSincroHandObservationsToPose } from "../sincroHandAssignment";
import type { SincroHandObservation } from "../sincroHandAssignmentSnapshot";
import {
    DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandFeatureSnapshot,
    type SincroHandMotionSnapshot,
} from "../sincroHandMotionSnapshot";
import {
    determineSincroHandOpenness,
    restoreHandLandmarksToFullFrame,
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

    it.each(["roi", "full-frame-fallback"] as const)(
        "%sで左右ラベルよりPose手首との距離を優先する",
        (source) => {
            const assignment = assignSincroHandObservationsToPose({
                observations: [
                    createObservation({ handIndex: 0, wrist: [0.78, 0.5] }),
                    createObservation({ handIndex: 1, wrist: [0.22, 0.5] }),
                ],
                leftWrist: { side: "left", point: [0.2, 0.5], confidence: 0.9 },
                rightWrist: { side: "right", point: [0.8, 0.5], confidence: 0.9 },
                source,
            });

            expect(assignment.leftHand.detected).toBe(true);
            expect(assignment.leftHand.fullFrameWrist).toEqual([0.22, 0.5]);
            expect(assignment.leftHand.handednessLabel).toBe("Right");
            expect(assignment.rightHand.detected).toBe(true);
            expect(assignment.rightHand.fullFrameWrist).toEqual([0.78, 0.5]);
            expect(assignment.rightHand.handednessLabel).toBe("Left");
        },
    );

    it.each(["roi", "full-frame-fallback"] as const)("%sで同じ手の二重割当を拒否する", (source) => {
        const assignment = assignSincroHandObservationsToPose({
            observations: [createObservation({ handIndex: 0, wrist: [0.5, 0.5] })],
            leftWrist: { side: "left", point: [0.5, 0.5], confidence: 0.9 },
            rightWrist: { side: "right", point: [0.5, 0.5], confidence: 0.9 },
            source,
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

    it("観測なしと距離超過では両経路が同じ未検出理由を返す", () => {
        for (const source of ["roi", "full-frame-fallback"] as const) {
            for (const observations of [[], [createObservation({ handIndex: 0, wrist: [0, 0] })]]) {
                const result = assignSincroHandObservationsToPose({
                    source,
                    observations,
                    leftWrist: { side: "left", point: [0.5, 0.5], confidence: 1 },
                    rightWrist: { side: "right", point: [0.8, 0.5], confidence: 1 },
                });
                for (const hand of [result.leftHand, result.rightHand]) {
                    expect(hand.detected).toBe(false);
                    expect(hand.source).toBe("lost");
                    expect(hand.warnings).toEqual(
                        observations.length === 0
                            ? ["landmarks_missing"]
                            : ["landmarks_missing", "side_inconsistent"],
                    );
                }
            }
        }
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
