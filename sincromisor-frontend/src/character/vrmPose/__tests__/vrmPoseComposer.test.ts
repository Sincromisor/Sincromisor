import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { describe, expect, it } from "vitest";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import { composeVrmPose } from "../vrmPoseComposer";
import {
    angleFromIdentity,
    COMPLETE_PROFILE,
    eulerQuaternion,
    expectNormalizedQuaternion,
    layer,
} from "./vrmPoseComposerTestHelpers";

describe("composeVrmPose", () => {
    it("suppresses idle and speech style additives for bones owned by active tracking IK", () => {
        const tracking = layer({
            id: "tracking-left-ik",
            kind: "tracking",
            blendMode: "override",
            pose: {
                leftUpperArm: eulerQuaternion(0, 0.4, 0),
                leftLowerArm: eulerQuaternion(0, 0.2, 0),
            },
            ownedBones: ["leftUpperArm", "leftLowerArm"],
        });
        const idle = layer({
            id: "idle",
            kind: "idle",
            blendMode: "additive",
            pose: {
                leftUpperArm: eulerQuaternion(0.2, 0, 0),
                rightUpperArm: eulerQuaternion(0.3, 0, 0),
            },
            ownedBones: ["leftUpperArm", "rightUpperArm"],
        });
        const speech = layer({
            id: "speech",
            kind: "style",
            blendMode: "additive",
            pose: { leftLowerArm: eulerQuaternion(0.5, 0, 0) },
            ownedBones: ["leftLowerArm"],
        });

        const result = composeVrmPose({
            layers: [speech, idle, tracking],
            profile: COMPLETE_PROFILE,
        });

        expect(result.suppressedLayers).toEqual([
            {
                id: "idle",
                kind: "idle",
                bone: "leftUpperArm",
                reason: "tracking_owns_bone",
            },
            {
                id: "speech",
                kind: "style",
                bone: "leftLowerArm",
                reason: "tracking_owns_bone",
            },
        ]);
        expectNormalizedQuaternion(result.finalPose.leftUpperArm, eulerQuaternion(0, 0.4, 0));
        expectNormalizedQuaternion(result.finalPose.leftLowerArm, eulerQuaternion(0, 0.2, 0));
        expect(result.finalPose.rightUpperArm).toBeDefined();
    });

    it("does not output a missing hand or finger bone", () => {
        const profile: MinimalAvatarMotionProfile = {
            ...COMPLETE_PROFILE,
            optionalBones: {
                ...COMPLETE_PROFILE.optionalBones,
                leftHand: false,
                leftIndexProximal: false,
            },
        };
        const result = composeVrmPose({
            profile,
            layers: [
                layer({
                    id: "fallback",
                    kind: "fallback",
                    pose: {
                        leftHand: eulerQuaternion(0, 0, 0.2),
                        leftIndexProximal: eulerQuaternion(0.1, 0, 0),
                        leftUpperArm: eulerQuaternion(0, 0.1, 0),
                    },
                    ownedBones: ["leftHand", "leftIndexProximal", "leftUpperArm"],
                }),
            ],
        });

        expect(result.finalPose.leftHand).toBeUndefined();
        expect(result.finalPose.leftIndexProximal).toBeUndefined();
        expect(result.finalPose.leftUpperArm).toBeDefined();
        expect(result.suppressedLayers).toEqual([
            {
                id: "fallback",
                kind: "fallback",
                bone: "leftHand",
                reason: "missing_optional_bone",
            },
            {
                id: "fallback",
                kind: "fallback",
                bone: "leftIndexProximal",
                reason: "missing_optional_bone",
            },
        ]);
    });

    it("damps a missing shoulder correction into the upper arm", () => {
        const profile: MinimalAvatarMotionProfile = {
            ...COMPLETE_PROFILE,
            optionalBones: {
                ...COMPLETE_PROFILE.optionalBones,
                leftShoulder: false,
            },
        };
        const result = composeVrmPose({
            profile,
            layers: [
                layer({
                    id: "fallback",
                    kind: "fallback",
                    pose: { leftShoulder: eulerQuaternion(0, MathUtils.degToRad(30), 0) },
                    ownedBones: ["leftShoulder"],
                }),
            ],
        });

        expect(result.finalPose.leftShoulder).toBeUndefined();
        expectNormalizedQuaternion(
            result.finalPose.leftUpperArm,
            eulerQuaternion(0, MathUtils.degToRad(30 * profile.solverDefaults.shoulderDamping), 0),
        );
        expect(result.suppressedLayers).toEqual([
            {
                id: "fallback",
                kind: "fallback",
                bone: "leftShoulder",
                reason: "missing_optional_bone",
            },
        ]);
    });

    it("normalizes output quaternions without storing Quaternion instances", () => {
        const result = composeVrmPose({
            profile: COMPLETE_PROFILE,
            layers: [
                layer({
                    id: "tracking",
                    kind: "tracking",
                    pose: { rightLowerArm: { x: 0, y: 2, z: 0, w: 2 } },
                    ownedBones: ["rightLowerArm"],
                }),
            ],
        });

        expectNormalizedQuaternion(result.finalPose.rightLowerArm, {
            x: 0,
            y: Math.SQRT1_2,
            z: 0,
            w: Math.SQRT1_2,
        });
        expect(result.finalPose.rightLowerArm).not.toBeInstanceOf(Quaternion);
        expect(result.clampedBones).toEqual([
            {
                bone: "rightLowerArm",
                reason: "quaternion_normalized",
                before: { x: 0, y: 2, z: 0, w: 2 },
                after: result.finalPose.rightLowerArm,
            },
        ]);
    });

    it("clamps angular velocity only when previous final pose and positive delta are present", () => {
        const target = eulerQuaternion(0, MathUtils.degToRad(90), 0);
        const unclamped = composeVrmPose({
            profile: COMPLETE_PROFILE,
            previousFinalPose: { leftUpperArm: eulerQuaternion(0, 0, 0) },
            layers: [
                layer({
                    id: "tracking",
                    kind: "tracking",
                    pose: { leftUpperArm: target },
                    ownedBones: ["leftUpperArm"],
                }),
            ],
        });
        const clamped = composeVrmPose({
            profile: COMPLETE_PROFILE,
            previousFinalPose: { leftUpperArm: eulerQuaternion(0, 0, 0) },
            deltaSeconds: 1 / 60,
            layers: [
                layer({
                    id: "tracking",
                    kind: "tracking",
                    pose: { leftUpperArm: target },
                    ownedBones: ["leftUpperArm"],
                }),
            ],
        });

        expectNormalizedQuaternion(unclamped.finalPose.leftUpperArm, target);
        expect(clamped.clampedBones).toEqual([
            {
                bone: "leftUpperArm",
                reason: "angular_velocity",
                before: target,
                after: clamped.finalPose.leftUpperArm,
            },
        ]);
        expect(angleFromIdentity(clamped.finalPose.leftUpperArm)).toBeCloseTo(
            MathUtils.degToRad(12),
            6,
        );
    });

    it("returns first-seen owned bones without duplicates", () => {
        const result = composeVrmPose({
            profile: COMPLETE_PROFILE,
            layers: [
                layer({
                    id: "fallback",
                    kind: "fallback",
                    pose: {
                        leftUpperArm: eulerQuaternion(0.1, 0, 0),
                        leftLowerArm: eulerQuaternion(0.2, 0, 0),
                    },
                    ownedBones: ["leftUpperArm", "leftLowerArm"],
                }),
                layer({
                    id: "style",
                    kind: "style",
                    blendMode: "additive",
                    pose: {
                        leftUpperArm: eulerQuaternion(0, 0.1, 0),
                        rightUpperArm: eulerQuaternion(0, 0.2, 0),
                    },
                    ownedBones: ["leftUpperArm", "rightUpperArm"],
                }),
            ],
        });

        expect(result.ownedBones).toEqual(["leftUpperArm", "leftLowerArm", "rightUpperArm"]);
        expect(new Set(result.ownedBones).size).toBe(result.ownedBones.length);
        expect(result.warnings).toEqual(["owned_bone_conflict:leftUpperArm"]);
    });
});
