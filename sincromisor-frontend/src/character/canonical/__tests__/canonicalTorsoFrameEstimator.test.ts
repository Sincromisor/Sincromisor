import { describe, expect, it } from "vitest";

import type { SincroFaceMotionSnapshot } from "../../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
    DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT,
    type SincroPoseMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { estimateCanonicalTorsoFrame } from "../canonicalTorsoFrameEstimator";
import {
    type CanonicalCalibrationSnapshot,
    type CanonicalTorsoFrame,
    type CanonicalTuple3,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../canonicalUpperBodyState";

function expectTupleClose(actual: CanonicalTuple3 | undefined, expected: CanonicalTuple3): void {
    expect(actual).toBeDefined();
    if (actual === undefined) {
        return;
    }
    expect(actual[0]).toBeCloseTo(expected[0], 6);
    expect(actual[1]).toBeCloseTo(expected[1], 6);
    expect(actual[2]).toBeCloseTo(expected[2], 6);
}

function createWorldTarget(
    position: CanonicalTuple3 | undefined,
    confidence = 1,
): SincroPoseTargetPointSnapshot {
    if (position === undefined) {
        return {
            ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
            world: { ...DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT },
        };
    }

    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        tracked: true,
        quality: "strong",
        confidence,
        visibility: confidence,
        presence: confidence,
        hasFiniteCoordinates: true,
        usableForIk: true,
        ikWeight: confidence,
        stale: false,
        world: {
            ...DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT,
            anchor: "shoulder_center",
            hasWorldCoordinates: true,
            worldQuality: "strong",
            worldConfidence: confidence,
            worldUsableForIk: true,
            worldIkWeight: confidence,
            normalizedX: position[0],
            normalizedY: position[1],
            normalizedZ: position[2],
        },
    };
}

function createPose(options: {
    leftShoulder?: CanonicalTuple3;
    rightShoulder?: CanonicalTuple3;
    leftHip?: CanonicalTuple3;
    rightHip?: CanonicalTuple3;
    shoulderConfidence?: number;
    hipConfidence?: number;
    hipCenterTracked?: boolean;
}): SincroPoseMotionSnapshot {
    const shoulderConfidence = options.shoulderConfidence ?? 1;
    const hipConfidence = options.hipConfidence ?? 1;
    return {
        ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
        trackingEnabled: true,
        detected: true,
        confidence: Math.min(shoulderConfidence, hipConfidence),
        upperBody: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.upperBody,
            hipCenterTracked: options.hipCenterTracked ?? options.leftHip !== undefined,
        },
        leftArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            targets: {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
                shoulder: createWorldTarget(options.leftShoulder, shoulderConfidence),
            },
        },
        rightArm: {
            ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
            targets: {
                ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT.targets,
                shoulder: createWorldTarget(options.rightShoulder, shoulderConfidence),
            },
        },
        lowerBodyTargets: {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT.lowerBodyTargets,
            leftHip: createWorldTarget(options.leftHip, hipConfidence),
            rightHip: createWorldTarget(options.rightHip, hipConfidence),
        },
    };
}

function createCalibration(
    overrides: Partial<CanonicalCalibrationSnapshot> = {},
): CanonicalCalibrationSnapshot {
    return {
        ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        handBaseline: {
            left: { ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.handBaseline.left },
            right: { ...DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.handBaseline.right },
        },
        ...overrides,
    };
}

function createTorsoFrame(overrides: Partial<CanonicalTorsoFrame> = {}): CanonicalTorsoFrame {
    return {
        coordinateSystem: "body_local",
        shoulderCenter: [0, 1, 0],
        hipCenter: [0, 0, 0],
        bodyRight: [1, 0, 0],
        bodyUp: [0, 1, 0],
        bodyFront: [0, 0, 1],
        shoulderWidth: 1,
        torsoScale: 1,
        yawRad: 0,
        confidence: 1,
        source: "pose",
        warnings: [],
        outOfRangeFields: [],
        ...overrides,
    };
}

function createPrevious(
    torso: Partial<CanonicalTorsoFrame>,
    calibration: Partial<CanonicalCalibrationSnapshot> = {},
): Pick<CanonicalUpperBodyState, "torso" | "calibration"> {
    return {
        torso: createTorsoFrame(torso),
        calibration: createCalibration(calibration),
    };
}

function createFace(
    options: Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose">,
): Pick<SincroFaceMotionSnapshot, "detected" | "confidence" | "headPose"> {
    return options;
}

describe("estimateCanonicalTorsoFrame", () => {
    it("uses valid world shoulders and hips for a normalized torso frame", () => {
        const result = estimateCanonicalTorsoFrame({
            pose: createPose({
                leftShoulder: [-0.5, 1, 0],
                rightShoulder: [0.5, 1, 0],
                leftHip: [-0.25, 0, 0],
                rightHip: [0.25, 0, 0],
                shoulderConfidence: 0.9,
                hipConfidence: 0.8,
            }),
            calibration: createCalibration({ shoulderWidth: 2 }),
            mediaTimeMs: 1000,
        });

        expectTupleClose(result.torso.shoulderCenter, [0, 1, 0]);
        expectTupleClose(result.torso.hipCenter, [0, 0, 0]);
        expectTupleClose(result.torso.bodyRight, [1, 0, 0]);
        expectTupleClose(result.torso.bodyUp, [0, 1, 0]);
        expectTupleClose(result.torso.bodyFront, [0, 0, 1]);
        expect(result.torso.shoulderWidth).toBeCloseTo(1);
        expect(result.torso.torsoScale).toBeCloseTo(1);
        expect(result.torso.confidence).toBeCloseTo(0.8);
        expect(result.torso.warnings).toEqual([]);
        expect(result.calibration.shoulderWidth).toBeCloseTo(1);
    });

    it("keeps previous hip center and body up when hip world targets are missing", () => {
        const previous = createPrevious(
            {
                hipCenter: [0.1, 0.2, 0.3],
                bodyUp: [0, 2, 0],
                confidence: 0.7,
            },
            { torsoScale: 1.7 },
        );

        const result = estimateCanonicalTorsoFrame({
            pose: createPose({
                leftShoulder: [-0.5, 1, 0],
                rightShoulder: [0.5, 1, 0],
                shoulderConfidence: 0.9,
                hipCenterTracked: false,
            }),
            previous,
            calibration: createCalibration({ torsoScale: 2.5 }),
            mediaTimeMs: 1100,
        });

        expectTupleClose(result.torso.hipCenter, [0.1, 0.2, 0.3]);
        expectTupleClose(result.torso.bodyUp, [0, 1, 0]);
        expect(result.torso.torsoScale).toBeCloseTo(1.7);
        expect(result.torso.confidence).toBeCloseTo(0.45);
        expect(result.torso.warnings).toContain("missing_world_coordinates");
    });

    it("rejects a front candidate that flips against the previous frame", () => {
        const result = estimateCanonicalTorsoFrame({
            pose: createPose({
                leftShoulder: [0.5, 1, 0],
                rightShoulder: [-0.5, 1, 0],
                leftHip: [-0.25, 0, 0],
                rightHip: [0.25, 0, 0],
            }),
            previous: createPrevious({ bodyFront: [0, 0, 1] }),
            mediaTimeMs: 1200,
        });

        expectTupleClose(result.torso.bodyFront, [0, 0, 1]);
        expect(result.torso.warnings).toContain("front_flip_rejected");
        expect(result.torso.confidence).toBeCloseTo(0.45);
    });

    it("falls back to calibration yaw when face is not detected", () => {
        const result = estimateCanonicalTorsoFrame({
            pose: createPose({
                leftShoulder: [-0.5, 1, 0],
                rightShoulder: [0.5, 1, 0],
                leftHip: [-0.25, 0, 0],
                rightHip: [0.25, 0, 0],
            }),
            face: createFace({
                detected: false,
                confidence: 1,
                headPose: { yawDeg: 35, pitchDeg: 0, rollDeg: 0 },
            }),
            calibration: createCalibration({ neutralYawRad: 0.33 }),
            mediaTimeMs: 1300,
        });

        expect(result.torso.yawRad).toBeCloseTo(0.33);
        expectTupleClose(result.torso.bodyFront, [0, 0, 1]);
    });

    it("uses valid face yaw hint to choose the front sign without a previous frame", () => {
        const result = estimateCanonicalTorsoFrame({
            pose: createPose({
                leftShoulder: [0, 1, -0.5],
                rightShoulder: [0, 1, 0.5],
                leftHip: [-0.25, 0, 0],
                rightHip: [0.25, 0, 0],
            }),
            face: createFace({
                detected: true,
                confidence: 0.9,
                headPose: { yawDeg: 89, pitchDeg: 0, rollDeg: 0 },
            }),
            mediaTimeMs: 1400,
        });

        expectTupleClose(result.torso.bodyFront, [1, 0, 0]);
        expect(result.torso.yawRad).toBeCloseTo((89 * Math.PI) / 180);
        expect(result.torso.warnings).toContain("front_flip_rejected");
    });

    it("returns a deterministic neutral frame when all world targets are missing", () => {
        const result = estimateCanonicalTorsoFrame({
            pose: createPose({ hipCenterTracked: false }),
            mediaTimeMs: 1500,
        });

        expectTupleClose(result.torso.shoulderCenter, [0, 1, 0]);
        expect(result.torso.hipCenter).toBeUndefined();
        expectTupleClose(result.torso.bodyRight, [1, 0, 0]);
        expectTupleClose(result.torso.bodyUp, [0, 1, 0]);
        expectTupleClose(result.torso.bodyFront, [0, 0, 1]);
        expect(result.torso.shoulderWidth).toBeCloseTo(1);
        expect(result.torso.torsoScale).toBeCloseTo(1);
        expect(result.torso.confidence).toBe(0);
        expect(result.torso.source).toBe("neutral");
        expect(result.torso.warnings).toEqual(
            expect.arrayContaining(["missing_world_coordinates", "torso_frame_unreliable"]),
        );
        expect(result.calibration).toEqual(DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT);
    });
});
