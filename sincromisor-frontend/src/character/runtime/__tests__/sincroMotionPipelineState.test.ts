import { describe, expect, it } from "vitest";
import { createSincroHandFallbackSnapshot } from "../../../features/gaze/handTracking/sincroHandMotionSnapshot";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalPartMeta,
    type CanonicalUpperBodyState,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../../canonical/canonicalUpperBodyState";
import { createDefaultMotionIntentState } from "../../motionIntent/motionIntentState";
import { createDefaultReliabilityMap } from "../../reliability/reliabilityMap";
import { createDefaultTemporalUpperBodyState } from "../../temporal/temporalUpperBodyState";
import type { VrmPoseComposerResult } from "../../vrmPose/vrmPoseTypes";
import {
    cloneSincroMotionPipelineState,
    createDefaultSincroMotionPipelineState,
    type SincroMotionPipelineState,
} from "../sincroMotionPipelineState";

function expectDefined<T>(value: T | undefined): T {
    if (value === undefined) {
        throw new Error("Expected value to be defined.");
    }
    return value;
}

function createCanonicalPartMeta(): CanonicalPartMeta {
    return {
        confidence: 0.8,
        source: "pose",
        warnings: ["front_flip_rejected"],
        outOfRangeFields: [
            {
                path: "arms.left.reach",
                value: 1.3,
                max: 1.15,
                clampedValue: 1.15,
            },
        ],
    };
}

function createCanonicalArmState(): CanonicalArmState {
    return {
        ...createCanonicalPartMeta(),
        reach: 0.6,
        elevationRad: 0.2,
        openness: 0.1,
        forwardness: 0.5,
        elbowFlexionRad: 1.2,
        classification: "front",
        bodyLocalWrist: [0.1, 0.2, 0.3],
        bodyLocalElbow: [0.2, 0.3, 0.4],
    };
}

function createCanonicalUpperBodyState(): CanonicalUpperBodyState {
    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs: 120,
            poseLastUpdatedAtMs: 118,
        },
        torso: {
            ...createCanonicalPartMeta(),
            coordinateSystem: "body_local",
            shoulderCenter: [0, 1, 2],
            hipCenter: [0, 0.5, 2],
            bodyRight: [1, 0, 0],
            bodyUp: [0, 1, 0],
            bodyFront: [0, 0, 1],
            shoulderWidth: 0.42,
            torsoScale: 1,
            yawRad: 0.1,
        },
        arms: {
            left: createCanonicalArmState(),
            right: createCanonicalArmState(),
        },
        calibration: DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
        warnings: ["front_flip_rejected"],
    };
}

function createComposerDryRun(): VrmPoseComposerResult {
    return {
        finalPose: {
            leftUpperArm: { x: 0, y: 0.1, z: 0, w: 1 },
        },
        ownedBones: ["leftUpperArm"],
        suppressedLayers: [
            {
                id: "semantic:left",
                kind: "semantic",
                bone: "leftHand",
                reason: "semantic_conflict",
            },
        ],
        clampedBones: [
            {
                bone: "leftUpperArm",
                reason: "angular_velocity",
                before: { x: 0, y: 1, z: 0, w: 1 },
                after: { x: 0, y: 0.1, z: 0, w: 1 },
            },
        ],
        warnings: ["owned_bone_conflict:leftUpperArm"],
    };
}

function createPipelineState(): SincroMotionPipelineState {
    const state = createDefaultSincroMotionPipelineState();
    state.face.headPose.matrix = [1, 2, 3];
    state.face.warnings.push("roi_missing");
    state.pose.lowerBodyTargets.leftHip.world.rawX = 0.25;
    const temporal = createDefaultTemporalUpperBodyState(120, { includeHead: true });
    temporal.arms.left.bodyLocalWrist = [0.2, 0.3, 0.4];

    return {
        ...state,
        hand: createSincroHandFallbackSnapshot({
            reason: "test",
            warnings: ["model_not_loaded"],
        }),
        reliability: createDefaultReliabilityMap(120),
        canonical: createCanonicalUpperBodyState(),
        temporal,
        intent: createDefaultMotionIntentState(120),
        composerDryRun: createComposerDryRun(),
        updatedAtMs: 777,
    };
}

describe("createDefaultSincroMotionPipelineState", () => {
    it("creates face and pose input slots without downstream optional state", () => {
        const state = createDefaultSincroMotionPipelineState();

        expect(state.face.detected).toBe(false);
        expect(state.pose.detected).toBe(false);
        expect(state.hand).toBeUndefined();
        expect(state.reliability).toBeUndefined();
        expect(state.canonical).toBeUndefined();
        expect(state.temporal).toBeUndefined();
        expect(state.intent).toBeUndefined();
        expect(state.composerDryRun).toBeUndefined();
        expect(state.updatedAtMs).toBe(0);
        expect("schemaVersion" in state).toBe(false);
    });
});

describe("cloneSincroMotionPipelineState", () => {
    it("clones input and downstream snapshots without reusing arrays or tuples", () => {
        const state = createPipelineState();
        const clone = cloneSincroMotionPipelineState(state);

        state.face.headPose.matrix?.push(4);
        state.face.warnings.push("after_clone");
        state.pose.lowerBodyTargets.leftHip.world.rawX = 0.75;
        expectDefined(state.hand).leftHand.warnings.push("low_confidence");
        expectDefined(state.reliability).warnings.push("camera_quality_low");
        expectDefined(state.reliability).joints.leftWrist.warnings.push("low_confidence");
        expectDefined(state.canonical).warnings.push("dropout");
        expectDefined(state.temporal).arms.left.warnings.push("prediction_active");
        expectDefined(state.intent).arms.left.warnings.push("gesture_cooldown");
        expectDefined(state.composerDryRun).ownedBones.push("leftLowerArm");
        expectDefined(state.composerDryRun).warnings.push("after_clone");

        expect(clone.face.headPose.matrix).toEqual([1, 2, 3]);
        expect(clone.face.warnings).toEqual(["roi_missing"]);
        expect(clone.pose.lowerBodyTargets.leftHip.world.rawX).toBe(0.25);
        expect(expectDefined(clone.hand).leftHand.warnings).toEqual([
            "landmarks_missing",
            "model_not_loaded",
        ]);
        expect(expectDefined(clone.reliability).warnings).toEqual(["no_observation"]);
        expect(expectDefined(clone.reliability).joints.leftWrist.warnings).toEqual([
            "no_observation",
        ]);
        expect(expectDefined(clone.canonical).warnings).toEqual(["front_flip_rejected"]);
        expect(expectDefined(clone.temporal).arms.left.warnings).toEqual(["dropout"]);
        expect(expectDefined(clone.intent).arms.left.warnings).toEqual(["fallback_active"]);
        expect(expectDefined(clone.composerDryRun).ownedBones).toEqual(["leftUpperArm"]);
        expect(expectDefined(clone.composerDryRun).warnings).toEqual([
            "owned_bone_conflict:leftUpperArm",
        ]);
        expect("schemaVersion" in clone).toBe(false);

        expect(expectDefined(clone.canonical).torso.shoulderCenter).not.toBe(
            expectDefined(state.canonical).torso.shoulderCenter,
        );
        expect(expectDefined(clone.temporal).arms.left.bodyLocalWrist).not.toBe(
            expectDefined(state.temporal).arms.left.bodyLocalWrist,
        );
        expect(expectDefined(clone.composerDryRun).suppressedLayers).not.toBe(
            expectDefined(state.composerDryRun).suppressedLayers,
        );
    });
});
