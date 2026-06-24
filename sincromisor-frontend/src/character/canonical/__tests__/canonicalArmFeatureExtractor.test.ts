import { describe, expect, it } from "vitest";

import {
    DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
    DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
    DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT,
    type SincroPoseArmMotionSnapshot,
    type SincroPoseTargetPointSnapshot,
} from "../../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import { createDefaultReliabilityMap, type ReliabilityMap } from "../../reliability/reliabilityMap";
import {
    createCanonicalUpperBodyState,
    extractCanonicalArmState,
} from "../canonicalArmFeatureExtractor";
import type { CanonicalTorsoFrameResult } from "../canonicalTorsoFrameEstimator";
import {
    type CanonicalTorsoFrame,
    type CanonicalTuple3,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
    parseCanonicalUpperBodyState,
} from "../canonicalUpperBodyState";

function createTorsoFrame(overrides: Partial<CanonicalTorsoFrame> = {}): CanonicalTorsoFrameResult {
    return {
        torso: {
            coordinateSystem: "body_local",
            shoulderCenter: [0, 0, 0],
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
        },
        calibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
    };
}

function createTarget(
    position: CanonicalTuple3,
    options: {
        confidence?: number;
        quality?: SincroPoseTargetPointSnapshot["quality"];
        hasWorldCoordinates?: boolean;
        omitWorldZ?: boolean;
        camera?: readonly [number, number];
    } = {},
): SincroPoseTargetPointSnapshot {
    const confidence = options.confidence ?? 1;
    const hasWorldCoordinates = options.hasWorldCoordinates ?? true;
    const camera = options.camera ?? [0.5 + position[0] * 0.2, 0.5 - position[1] * 0.2];
    return {
        ...DEFAULT_SINCRO_POSE_TARGET_POINT_SNAPSHOT,
        tracked: options.quality !== "lost",
        quality: options.quality ?? "strong",
        confidence,
        visibility: confidence,
        presence: confidence,
        hasFiniteCoordinates: true,
        usableForIk: true,
        ikWeight: confidence,
        stale: false,
        cameraX: camera[0],
        cameraY: camera[1],
        localX: position[0],
        localY: position[1],
        localZ: position[2],
        world: {
            ...DEFAULT_SINCRO_POSE_WORLD_TARGET_SNAPSHOT,
            anchor: "shoulder_center",
            hasWorldCoordinates,
            worldQuality: options.quality ?? "strong",
            worldConfidence: confidence,
            worldUsableForIk: hasWorldCoordinates,
            worldIkWeight: hasWorldCoordinates ? confidence : 0,
            normalizedX: hasWorldCoordinates ? position[0] : undefined,
            normalizedY: hasWorldCoordinates ? position[1] : undefined,
            normalizedZ:
                hasWorldCoordinates && options.omitWorldZ !== true ? position[2] : undefined,
        },
    };
}

function createArm(
    side: "left" | "right",
    shoulder: CanonicalTuple3,
    elbow: CanonicalTuple3,
    wrist: CanonicalTuple3,
    options: {
        confidence?: number;
        tracked?: boolean;
        hasWorldCoordinates?: boolean;
        omitWorldZ?: boolean;
    } = {},
): SincroPoseArmMotionSnapshot {
    const confidence = options.confidence ?? 1;
    return {
        ...DEFAULT_SINCRO_POSE_ARM_MOTION_SNAPSHOT,
        tracked: options.tracked ?? true,
        confidence,
        targets: {
            shoulder: createTarget(shoulder, {
                confidence,
                hasWorldCoordinates: options.hasWorldCoordinates,
                omitWorldZ: options.omitWorldZ,
                camera: side === "right" ? [0.45, 0.5] : [0.55, 0.5],
            }),
            elbow: createTarget(elbow, {
                confidence,
                hasWorldCoordinates: options.hasWorldCoordinates,
                omitWorldZ: options.omitWorldZ,
                camera: side === "right" ? [0.65, 0.5] : [0.35, 0.5],
            }),
            wrist: createTarget(wrist, {
                confidence,
                hasWorldCoordinates: options.hasWorldCoordinates,
                omitWorldZ: options.omitWorldZ,
                camera: side === "right" ? [0.85, 0.5] : [0.15, 0.5],
            }),
        },
    };
}

function createTrackedReliabilityMap(mediaTimeMs = 1234): ReliabilityMap {
    const reliability = createDefaultReliabilityMap(mediaTimeMs);
    reliability.warnings = [];
    for (const joint of [
        reliability.joints.leftShoulder,
        reliability.joints.leftElbow,
        reliability.joints.leftWrist,
        reliability.joints.rightShoulder,
        reliability.joints.rightElbow,
        reliability.joints.rightWrist,
    ]) {
        joint.state = "tracked";
        joint.finalWeight = 1;
        joint.source = "pose";
        joint.warnings = [];
        for (const component of Object.values(joint.components)) {
            component.score = 1;
            component.reasonCodes = [];
        }
    }
    for (const part of [reliability.parts.leftArm, reliability.parts.rightArm]) {
        part.state = "tracked";
        part.finalWeight = 1;
        part.source = "pose";
        part.warnings = [];
        for (const component of Object.values(part.components)) {
            component.score = 1;
            component.reasonCodes = [];
        }
    }
    return reliability;
}

describe("extractCanonicalArmState", () => {
    it("returns neutral parseable state when pose arm data is missing", () => {
        const state = createCanonicalUpperBodyState({
            pose: DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            torso: createTorsoFrame({ confidence: 0, source: "neutral" }),
            mediaTimeMs: 1234,
        });

        expect(state.arms.left.confidence).toBe(0);
        expect(state.arms.right.source).toBe("neutral");
        expect(state.arms.left.classification).toBe("unknown");
        expect(state.warnings).toContain("missing_world_coordinates");
        expect(parseCanonicalUpperBodyState(state).ok).toBe(true);
    });

    it("classifies a right arm opened to the anatomical side", () => {
        const arm = createArm("right", [0.5, 0, 0], [1, 0, 0], [1.5, 0, 0]);

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame(),
        });

        expect(state.openness).toBeGreaterThan(0);
        expect(state.forwardness).toBeLessThan(0.45);
        expect(state.classification).toBe("side");
    });

    it("classifies a wrist moving toward body front as front", () => {
        const arm = createArm("right", [0, 0, 0], [0, 0, 0.5], [0, 0, 1]);

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame(),
        });

        expect(state.forwardness).toBeGreaterThanOrEqual(0.62);
        expect(state.classification).toBe("front");
    });

    it("prioritizes crossed classification for an inward left arm", () => {
        const arm = createArm("left", [-0.5, 0, 0], [-0.1, 0, 0], [0.3, 0, 0]);

        const state = extractCanonicalArmState({
            side: "left",
            arm,
            torso: createTorsoFrame(),
        });

        expect(state.openness).toBeLessThan(0);
        expect(state.classification).toBe("crossed");
    });

    it("keeps finite forwardness and confidence when only world Z auxiliary input is missing", () => {
        const arm = createArm("right", [0.5, 0, 0], [1, 0, 0], [1.5, 0, 0], {
            omitWorldZ: true,
        });

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame(),
        });

        expect(Number.isFinite(state.forwardness)).toBe(true);
        expect(state.forwardness).toBeGreaterThanOrEqual(0);
        expect(state.forwardness).toBeLessThanOrEqual(1);
        expect(state.confidence).toBe(1);
        expect(state.warnings).not.toContain("missing_world_coordinates");
    });

    it("returns zero confidence and missing world warning for invalid arm length", () => {
        const arm = createArm("right", [0.5, 0, 0], [0.5, 0, 0], [0.5, 0, 0]);

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame(),
        });

        expect(state.reach).toBe(0);
        expect(state.confidence).toBe(0);
        expect(state.warnings).toContain("missing_world_coordinates");
        expect(state.classification).toBe("unknown");
    });

    it("records out-of-range fields when computed values are clamped", () => {
        const arm = createArm("right", [0.5, 0, 0], [1, 0, 0], [1.5, 0, 0]);

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame({ bodyRight: [2, 0, 0] }),
        });

        expect(state.reach).toBe(1.15);
        expect(state.warnings).toContain("out_of_range");
        expect(state.outOfRangeFields).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    path: "reach",
                    clampedValue: 1.15,
                }),
            ]),
        );
    });

    it("keeps old confidence when reliability is not provided", () => {
        const arm = createArm("right", [0.5, 0, 0], [1, 0, 0], [1.5, 0, 0], {
            confidence: 0.8,
        });

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame(),
        });

        expect(state.confidence).toBe(0.8);
        expect(state.source).toBe("pose");
    });

    it("keeps confidence nearly unchanged when reliability is high", () => {
        const reliability = createTrackedReliabilityMap();
        const arm = createArm("right", [0.5, 0, 0], [1, 0, 0], [1.5, 0, 0], {
            confidence: 0.8,
        });

        const state = extractCanonicalArmState({
            side: "right",
            arm,
            torso: createTorsoFrame(),
            reliability,
        });

        expect(state.confidence).toBeCloseTo(0.8);
        expect(state.source).toBe("pose");
    });

    it("downweights suspect reliability without discarding the pose source", () => {
        const reliability = createTrackedReliabilityMap();
        reliability.parts.leftArm.state = "suspect";
        reliability.parts.leftArm.finalWeight = 0.25;
        reliability.joints.leftWrist.state = "suspect";
        reliability.joints.leftWrist.finalWeight = 0.64;
        const arm = createArm("left", [-0.5, 0, 0], [-1, 0, 0], [-1.5, 0, 0]);

        const state = extractCanonicalArmState({
            side: "left",
            arm,
            torso: createTorsoFrame(),
            reliability,
        });

        expect(state.confidence).toBeCloseTo(0.4);
        expect(state.source).toBe("pose");
        expect(state.warnings).toContain("low_confidence");
    });

    it("turns lost reliability into neutral source with zero confidence", () => {
        const reliability = createTrackedReliabilityMap();
        reliability.parts.leftArm.state = "lost";
        reliability.parts.leftArm.finalWeight = 0;
        const arm = createArm("left", [-0.5, 0, 0], [-1, 0, 0], [-1.5, 0, 0]);

        const state = extractCanonicalArmState({
            side: "left",
            arm,
            torso: createTorsoFrame(),
            reliability,
        });

        expect(state.confidence).toBe(0);
        expect(state.source).toBe("neutral");
        expect(state.warnings).toContain("low_confidence");
    });

    it("maps reliability reason codes into canonical warnings", () => {
        const reliability = createTrackedReliabilityMap();
        reliability.parts.leftArm.components.side.reasonCodes = ["side_inconsistent"];
        reliability.joints.leftElbow.components.boneLength.reasonCodes = [
            "bone_length_inconsistent",
        ];
        reliability.parts.rightArm.components.bodyScale.reasonCodes = ["body_scale_jump"];
        const pose = {
            ...DEFAULT_SINCRO_POSE_MOTION_SNAPSHOT,
            detected: true,
            confidence: 1,
            leftArm: createArm("left", [-0.5, 0, 0], [-1, 0, 0], [-1.5, 0, 0]),
            rightArm: createArm("right", [0.5, 0, 0], [1, 0, 0], [1.5, 0, 0]),
        };

        const state = createCanonicalUpperBodyState({
            pose,
            torso: createTorsoFrame(),
            mediaTimeMs: 1234,
            reliability,
        });

        expect(state.arms.left.warnings).toContain("left_right_swap_suspect");
        expect(state.arms.left.warnings).toContain("out_of_range");
        expect(state.arms.right.warnings).toContain("out_of_range");
        expect(state.warnings).toEqual(
            expect.arrayContaining(["left_right_swap_suspect", "out_of_range"]),
        );
        expect(parseCanonicalUpperBodyState(state).ok).toBe(true);
    });
});
