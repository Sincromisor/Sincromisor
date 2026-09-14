import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT } from "../../poseTracking/sincroPoseMotionSnapshot";
import { assignSincroHandObservationsToPose } from "../sincroHandAssignment";
import type { SincroHandObservation } from "../sincroHandAssignmentSnapshot";
import {
    createSincroHandFeatureSnapshot,
    determineSincroHandOpenness,
} from "../sincroHandFeatures";
import {
    DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandFeatureSnapshot,
    type SincroHandMotionSnapshot,
} from "../sincroHandMotionSnapshot";
import {
    normalizeSincroHandLandmarkerResult,
    restoreHandLandmarksToFullFrame,
} from "../sincroHandNormalization";
import { SincroHandTracker } from "../sincroHandTracker";

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
    it("非有限座標を補正し、点数不足の結果を捨てる", () => {
        const landmarks = createLandmarks();
        landmarks[0] = createLandmark(Number.NaN, 0.5, 1);
        landmarks[1] = createLandmark(0.2, 0.3, Number.POSITIVE_INFINITY);
        const result = normalizeSincroHandLandmarkerResult({
            result: {
                landmarks: [landmarks, landmarks.slice(0, 20)],
                worldLandmarks: [],
                handednesses: [],
                handedness: [[{ categoryName: "Left", displayName: "", index: 0, score: 0.9 }]],
            },
        });
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            handIndex: 0,
            wrist: [0, 0],
            confidence: 0.9,
            handednessLabel: "Left",
            warnings: ["landmarks_missing"],
            features: { openness: "unknown" },
        });
        expect(restoreHandLandmarksToFullFrame({ landmarks })?.landmarks[1]).toEqual({
            x: 0.2,
            y: 0.3,
            z: 0,
        });
    });

    it("掌方向と曲げ・開き・親指の特徴量を既存の尺度で計算する", () => {
        const landmarks = createLandmarks();
        landmarks[0] = createLandmark(0, 0);
        landmarks[2] = createLandmark(1, 0);
        landmarks[4] = createLandmark(-1, 1);
        for (const [mcp, tip, x] of [
            [5, 8, 1],
            [9, 12, 0],
            [13, 16, -0.5],
            [17, 20, -1],
        ] as const) {
            landmarks[mcp] = createLandmark(x, 1);
            landmarks[tip] = createLandmark(x, 1);
        }
        const features = createSincroHandFeatureSnapshot({
            landmarks,
            confidence: 0.9,
            landmarksMissing: false,
        });
        expect(features.palmNormal).toEqual([0, -0, 1]);
        expect(features.palmDirection).toEqual([0, 1, 0]);
        expect(features.fingerCurl).toEqual({ thumb: 0, index: 1, middle: 1, ring: 1, little: 1 });
        expect(features.fingerSplay.indexMiddle).toBeCloseTo(0.75);
        expect(features.fingerSplay.middleRing).toBeCloseTo(Math.atan(0.5) / (Math.PI / 3));
        expect(features.fingerSplay.ringLittle).toBeCloseTo(
            (Math.PI / 4 - Math.atan(0.5)) / (Math.PI / 3),
        );
        expect(features.thumbOppose).toBe(1);
        expect(features.openness).toBe("closed");
    });

    it("推論時間と終了時刻間隔のFPSを保ち、停止後は初回扱いに戻す", () => {
        const detectForVideo = vi.fn(() => ({
            landmarks: [],
            worldLandmarks: [],
            handednesses: [],
            handedness: [],
        }));
        const tracker = new SincroHandTracker({
            handLandmarker: { detectForVideo, close: () => {} },
        });
        const clock = vi.spyOn(performance, "now");
        const frame: TexImageSource = Object.create(null);
        try {
            clock.mockReturnValueOnce(100).mockReturnValueOnce(104);
            expect(tracker.detect(frame, DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT, 1000)).toMatchObject({
                inferenceTimeMs: 4,
                inferenceFps: 0,
                lastUpdatedAtMs: 1000,
            });
            clock.mockReturnValueOnce(200).mockReturnValueOnce(206);
            const second = tracker.detect(frame, DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT, 2000);
            expect(second.inferenceTimeMs).toBe(6);
            expect(second.inferenceFps).toBeCloseTo(1000 / 102);
            tracker.stop("test", 2500);
            clock.mockReturnValueOnce(300).mockReturnValueOnce(307);
            expect(tracker.detect(frame, DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT, 3000)).toMatchObject({
                inferenceTimeMs: 7,
                inferenceFps: 0,
            });
            clock.mockReturnValueOnce(307).mockReturnValueOnce(307);
            expect(tracker.detect(frame, DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT, 4000)).toMatchObject({
                inferenceTimeMs: 0,
                inferenceFps: 1000,
            });
            expect(detectForVideo.mock.calls).toHaveLength(4);
            expect(detectForVideo).toHaveBeenLastCalledWith(frame, 4000);
        } finally {
            clock.mockRestore();
            tracker.dispose();
        }
    });

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
