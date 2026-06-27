import { describe, expect, it } from "vitest";

import type { SincroFaceMotionSnapshot } from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
    DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
    type SincroHandMotionSnapshot,
    type SincroHandSideSnapshot,
} from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { SincroRoiObservation } from "../../../features/gaze/trackingRuntime/roiTracking/roiTrackingTypes";
import { parseReliabilityMap } from "../reliabilityMap";
import {
    createCameraQuality,
    createMap,
    createPoint,
    createPose,
} from "./poseReliabilityEstimatorFixtures";

function createRoi(
    side: SincroRoiObservation["side"],
    options: Partial<SincroRoiObservation> = {},
): SincroRoiObservation {
    return {
        side,
        source: side === "face" ? "pose-face" : "pose-wrist",
        rect: {
            centerX: 0.5,
            centerY: 0.5,
            width: 0.24,
            height: 0.24,
            clamped: false,
        },
        confidence: 0.88,
        referencePoint: side === "right" ? [0.74, 0.68] : [0.26, 0.68],
        warnings: [],
        ...options,
    };
}

function createFaceSnapshot(
    overrides: Partial<SincroFaceMotionSnapshot> = {},
): SincroFaceMotionSnapshot {
    return {
        trackingEnabled: true,
        detected: true,
        confidence: 0.86,
        headPose: {
            yawDeg: 3,
            pitchDeg: -2,
            rollDeg: 1,
        },
        blendshapes: {},
        roi: createRoi("face", {
            referencePoint: [0.5, 0.32],
            confidence: 0.82,
        }),
        source: "roi",
        warnings: [],
        inferenceTimeMs: 4,
        inferenceFps: 15,
        ...overrides,
    };
}

function createHandSide(
    side: "left" | "right",
    overrides: Partial<SincroHandSideSnapshot> = {},
): SincroHandSideSnapshot {
    const referencePoint: readonly [number, number] = side === "left" ? [0.26, 0.68] : [0.74, 0.68];
    return {
        detected: true,
        assignedSide: side,
        source: "roi",
        confidence: 0.84,
        handednessScore: 0.9,
        roi: createRoi(side, { referencePoint }),
        fullFrameWrist: referencePoint,
        features: {
            ...DEFAULT_SINCRO_HAND_FEATURE_SNAPSHOT,
            fingerCurl: {
                thumb: 0.2,
                index: 0.3,
                middle: 0.32,
                ring: 0.34,
                little: 0.36,
            },
            openness: "open",
        },
        warnings: [],
        ...overrides,
    };
}

function createHandSnapshot(
    overrides: Partial<SincroHandMotionSnapshot> = {},
): SincroHandMotionSnapshot {
    return {
        ...DEFAULT_SINCRO_HAND_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        leftHand: createHandSide("left"),
        rightHand: createHandSide("right"),
        inferenceTimeMs: 6,
        inferenceFps: 4,
        ...overrides,
    };
}

describe("createPoseReliabilityMap", () => {
    it("creates a parseable pose reliability map with pose placeholders", () => {
        const reliability = createMap(createPose());

        expect(parseReliabilityMap(reliability).ok).toBe(true);
        expect(reliability.joints.leftWrist.state).toBe("tracked");
        expect(reliability.joints.head).toMatchObject({
            state: "lost",
            finalWeight: 0,
            warnings: ["not_available_in_pose_snapshot"],
        });
        expect(reliability.parts.leftFinger).toMatchObject({
            state: "lost",
            finalWeight: 0,
            warnings: ["not_available_in_pose_snapshot"],
        });
    });

    it("marks a wrist near the image border as suspect with a fixed border score", () => {
        const reliability = createMap(
            createPose({
                leftWrist: createPoint([0.02, 0.68], [-1.3, -0.6, 0]),
            }),
        );

        expect(reliability.joints.leftWrist.components.border).toEqual({
            score: 0,
            reasonCodes: ["bad_border"],
        });
        expect(reliability.joints.leftWrist.state).toBe("suspect");
        expect(reliability.joints.leftWrist.finalWeight).toBeCloseTo((0.9 * 0.9 * 0.001) ** 0.1, 6);
    });

    it("keeps a lost elbow as a zero-weight observation and drops the arm part", () => {
        const reliability = createMap(
            createPose({
                leftElbow: createPoint([0.32, 0.5], [-0.9, -0.3, 0], { quality: "lost" }),
            }),
        );

        expect(reliability.joints.leftElbow).toMatchObject({
            state: "lost",
            finalWeight: 0,
        });
        expect(reliability.joints.leftElbow.components.tracking).toEqual({
            score: 0,
            reasonCodes: ["tracking_lost"],
        });
        expect(reliability.parts.leftArm).toMatchObject({
            state: "lost",
            finalWeight: 0,
        });
    });

    it("uses missing world coordinates as the fixed bone length fallback", () => {
        const reliability = createMap(
            createPose({
                rightWrist: createPoint([0.74, 0.68], [1.3, -0.6, 0], {
                    hasWorldCoordinates: false,
                }),
            }),
        );

        expect(reliability.joints.rightWrist.components.boneLength).toEqual({
            score: 0.5,
            reasonCodes: ["missing_world_coordinates"],
        });
        expect(reliability.joints.rightWrist.state).toBe("tracked");
        expect(reliability.joints.rightWrist.finalWeight).toBeCloseTo((0.9 * 0.9 * 0.5) ** 0.1, 6);
    });

    it("keeps weak pose targets with tracking score 0.45", () => {
        const reliability = createMap(
            createPose({
                leftWrist: createPoint([0.26, 0.68], [-1.3, -0.6, 0], {
                    quality: "weak",
                }),
            }),
        );

        expect(reliability.joints.leftWrist.components.tracking).toEqual({
            score: 0.45,
            reasonCodes: ["weak_tracking"],
        });
        expect(reliability.joints.leftWrist.state).toBe("tracked");
        expect(reliability.joints.leftWrist.finalWeight).toBeCloseTo((0.9 * 0.9 * 0.45) ** 0.1, 6);
    });

    it("maps bad camera quality into the camera component without hiding pose observations", () => {
        const reliability = createMap(createPose(), { cameraQuality: createCameraQuality(0) });

        expect(reliability.camera).toMatchObject({
            cameraQualityScore: 0,
            cameraQualityStatus: "bad",
            reasonCodes: ["camera_quality_bad"],
        });
        expect(reliability.joints.leftWrist.components.cameraQuality).toEqual({
            score: 0,
            reasonCodes: ["camera_quality_bad"],
        });
        expect(reliability.joints.leftWrist.state).toBe("suspect");
        expect(reliability.joints.leftWrist.finalWeight).toBeCloseTo((0.9 * 0.9 * 0.001) ** 0.1, 6);
    });

    it("zeros finalWeight when component degradation makes a non-forced joint lost", () => {
        const previous = createPose({
            leftWrist: createPoint([-0.7, 0.68], [-1.3, -0.6, 0]),
        });
        const degradedWrist = {
            ...createPoint([0.02, 0.68], [-1.3, -0.6, 0], {
                hasWorldCoordinates: false,
            }),
            presence: 0,
            visibility: 0,
        };
        const reliability = createMap(
            createPose({
                shoulderWidth: 0,
                leftWrist: degradedWrist,
            }),
            {
                cameraQuality: createCameraQuality(0),
                previous: { pose: previous, mediaTimeMs: 900 },
                mediaTimeMs: 1000,
            },
        );

        expect(reliability.joints.leftWrist.components.tracking).toEqual({
            score: 1,
            reasonCodes: [],
        });
        expect(reliability.joints.leftWrist.state).toBe("lost");
        expect(reliability.joints.leftWrist.finalWeight).toBe(0);
    });

    it("fixes temporal jump thresholds from the previous pose media time", () => {
        const previous = createPose({
            leftWrist: createPoint([-0.7, 0.68], [-1.3, -0.6, 0]),
        });
        const reliability = createMap(createPose(), {
            previous: { pose: previous, mediaTimeMs: 900 },
            mediaTimeMs: 1000,
        });

        expect(reliability.joints.leftWrist.components.temporal).toEqual({
            score: 0.1,
            reasonCodes: ["temporal_jump"],
        });
        expect(reliability.joints.leftWrist.finalWeight).toBeCloseTo((0.9 * 0.9 * 0.1) ** 0.1, 6);
    });

    it("fixes bone length and body scale threshold scores", () => {
        const previous = createPose({ shoulderWidth: 0.24 });
        const reliability = createMap(
            createPose({
                shoulderWidth: 0.4,
                leftElbow: createPoint([0.32, 0.5], [-1, 0, 0]),
                leftWrist: createPoint([0.26, 0.68], [-2, 0, 0]),
                rightElbow: createPoint([0.68, 0.5], [0.75, 0, 0]),
                rightWrist: createPoint([0.74, 0.68], [1.75, 0, 0]),
            }),
            { previous: { pose: previous, mediaTimeMs: 900 } },
        );

        expect(reliability.joints.leftWrist.components.boneLength).toEqual({
            score: 0.55,
            reasonCodes: ["bone_length_inconsistent"],
        });
        expect(reliability.joints.rightWrist.components.boneLength).toEqual({
            score: 0.15,
            reasonCodes: ["bone_length_inconsistent"],
        });
        expect(reliability.joints.leftWrist.components.bodyScale).toEqual({
            score: 0.55,
            reasonCodes: ["body_scale_jump"],
        });
    });

    it("turns a pose fallback snapshot into lost pose joints with fallback reasons", () => {
        const reliability = createMap(
            createPose({
                detected: false,
                fallbackReason: "pose_fallback",
            }),
        );

        expect(reliability.joints.leftWrist).toMatchObject({
            state: "lost",
            finalWeight: 0,
        });
        expect(reliability.joints.leftWrist.components.modelPresence.reasonCodes).toEqual([
            "pose_not_detected",
            "fallback_snapshot",
        ]);
        expect(reliability.joints.leftWrist.components.bodyScale).toEqual({
            score: 0,
            reasonCodes: ["body_scale_missing"],
        });
        expect(parseReliabilityMap(reliability).ok).toBe(true);
    });

    it("uses detected face ROI metadata for head reliability", () => {
        const reliability = createMap(createPose(), {
            face: createFaceSnapshot(),
        });

        expect(reliability.joints.head).toMatchObject({
            state: "tracked",
            source: "face",
            components: {
                modelPresence: { score: 0.86, reasonCodes: [] },
                tracking: { score: 0.86, reasonCodes: [] },
                roi: { score: 0.82, reasonCodes: [] },
            },
        });
        expect(parseReliabilityMap(reliability).ok).toBe(true);
    });

    it("uses detected hand ROI consistency for hand and finger reliability", () => {
        const reliability = createMap(createPose(), {
            hand: createHandSnapshot(),
        });

        expect(reliability.joints.leftHand).toMatchObject({
            state: "tracked",
            source: "hand",
            components: {
                roi: { score: 1, reasonCodes: [] },
                side: { score: 1, reasonCodes: [] },
            },
        });
        expect(reliability.parts.leftHand).toMatchObject({
            state: "tracked",
            source: "hand",
            joints: ["leftWrist", "leftHand"],
        });
        expect(reliability.parts.leftFinger).toMatchObject({
            state: "tracked",
            source: "hand",
            joints: ["leftHand"],
            components: {
                modelPresence: { score: 1, reasonCodes: [] },
            },
        });
        expect(parseReliabilityMap(reliability).ok).toBe(true);
    });

    it("downweights side-inconsistent hands to suspect reliability", () => {
        const reliability = createMap(createPose(), {
            hand: createHandSnapshot({
                leftHand: createHandSide("left", {
                    warnings: ["side_inconsistent"],
                }),
            }),
        });

        expect(reliability.joints.leftHand.state).toBe("suspect");
        expect(reliability.joints.leftHand.finalWeight).toBeLessThanOrEqual(0.45);
        expect(reliability.joints.leftHand.components.side).toEqual({
            score: 0.35,
            reasonCodes: ["side_inconsistent"],
        });
        expect(reliability.joints.leftHand.warnings).toEqual(
            expect.arrayContaining(["side_inconsistent", "low_confidence"]),
        );
    });

    it("keeps ROI metadata absence distinct from ROI failure warnings", () => {
        const reliability = createMap(createPose(), {
            hand: createHandSnapshot({
                leftHand: createHandSide("left", {
                    roi: undefined,
                    fullFrameWrist: [0.26, 0.68],
                }),
                rightHand: createHandSide("right", {
                    roi: createRoi("right", {
                        confidence: 0,
                        warnings: ["roi_missing"],
                    }),
                }),
            }),
            face: createFaceSnapshot({
                detected: false,
                roi: undefined,
                source: "lost",
            }),
        });

        expect(reliability.joints.leftHand.components.roi).toEqual({
            score: 0.55,
            reasonCodes: ["not_available_in_pose_snapshot"],
        });
        expect(reliability.joints.rightHand.components.roi.reasonCodes).toEqual(["roi_missing"]);
        expect(reliability.joints.rightHand.components.roi.reasonCodes).not.toContain(
            "not_available_in_pose_snapshot",
        );
        expect(reliability.joints.head.components.roi).toEqual({
            score: 0.55,
            reasonCodes: ["not_available_in_pose_snapshot"],
        });
    });

    it("keeps gesture reliability as a neutral placeholder with hand input", () => {
        const reliability = createMap(createPose(), {
            hand: createHandSnapshot(),
        });

        expect(reliability.gesture).toMatchObject({
            state: "lost",
            finalWeight: 0,
            source: "neutral",
            confidence: 0,
            warnings: ["no_observation"],
        });
        expect(reliability.gesture.label).toBeUndefined();
    });
});
