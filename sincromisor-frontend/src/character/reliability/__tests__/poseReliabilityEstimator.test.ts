import { describe, expect, it } from "vitest";

import { parseReliabilityMap } from "../reliabilityMap";
import {
    createCameraQuality,
    createMap,
    createPoint,
    createPose,
} from "./poseReliabilityEstimatorFixtures";

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
});
