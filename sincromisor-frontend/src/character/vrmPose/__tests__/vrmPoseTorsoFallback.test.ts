import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import { describe, expect, it } from "vitest";
import type { AvatarMotionProfile } from "../../avatarProfile/avatarMotionProfile";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import { composeVrmPose } from "../vrmPoseComposer";
import { createTorsoFallbackLayer, resolveTorsoDistribution } from "../vrmPoseTorsoFallback";
import {
    angleFromIdentity,
    COMPLETE_PROFILE,
    eulerQuaternion,
    layer,
} from "./vrmPoseComposerTestHelpers";

const DELTA = eulerQuaternion(0, MathUtils.degToRad(80), 0);

describe("createTorsoFallbackLayer", () => {
    it("distributes torso delta across spine, chest, and upperChest", () => {
        const profile = profileWithTorso({
            bones: { spine: true, chest: true, upperChest: true },
            distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 },
        });

        const fallback = createTorsoFallbackLayer({
            id: "torso",
            profile,
            delta: DELTA,
            weight: 1,
        });

        expect(fallback.kind).toBe("fallback");
        expect(fallback.blendMode).toBe("additive");
        expect(fallback.ownedBones).toEqual(["spine", "chest", "upperChest"]);
        expect(angleFromIdentity(fallback.pose.spine)).toBeCloseTo(MathUtils.degToRad(20), 6);
        expect(angleFromIdentity(fallback.pose.chest)).toBeCloseTo(MathUtils.degToRad(32), 6);
        expect(angleFromIdentity(fallback.pose.upperChest)).toBeCloseTo(MathUtils.degToRad(28), 6);
    });

    it("omits upperChest for spine and chest rigs", () => {
        const profile = profileWithTorso({
            bones: { spine: true, chest: true, upperChest: false },
            distribution: { spine: 0.35, chest: 0.65, upperChest: 0 },
        });

        const fallback = createTorsoFallbackLayer({
            id: "torso",
            profile,
            delta: DELTA,
            weight: 1,
        });

        expect(fallback.ownedBones).toEqual(["spine", "chest"]);
        expect(angleFromIdentity(fallback.pose.spine)).toBeCloseTo(MathUtils.degToRad(28), 6);
        expect(angleFromIdentity(fallback.pose.chest)).toBeCloseTo(MathUtils.degToRad(52), 6);
        expect(fallback.pose.upperChest).toBeUndefined();
    });

    it("uses spine only when chest and upperChest are unavailable", () => {
        const profile = profileWithTorso({
            bones: { spine: true, chest: false, upperChest: false },
            distribution: { spine: 1, chest: 0, upperChest: 0 },
        });

        const fallback = createTorsoFallbackLayer({
            id: "torso",
            profile,
            delta: DELTA,
            weight: Number.NaN,
            kind: "tracking",
        });

        expect(fallback.kind).toBe("tracking");
        expect(fallback.weight).toBe(0);
        expect(fallback.ownedBones).toEqual(["spine"]);
        expect(angleFromIdentity(fallback.pose.spine)).toBeCloseTo(MathUtils.degToRad(80), 6);
    });

    it("falls back to capability default for invalid profile distribution", () => {
        const profile = profileWithTorso({
            bones: { spine: true, chest: true, upperChest: true },
            distribution: { spine: 1, chest: -1, upperChest: 1 },
        });

        const result = resolveTorsoDistribution(profile);

        expect(result).toEqual({
            distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 },
            source: "capability_default",
            warnings: ["invalid_torso_distribution_profile_defaulted"],
        });
    });

    it("lets composer suppress missing optional torso bones without throwing", () => {
        const profile: MinimalAvatarMotionProfile = {
            ...COMPLETE_PROFILE,
            optionalBones: { ...COMPLETE_PROFILE.optionalBones, upperChest: false },
        };

        const result = composeVrmPose({
            profile,
            layers: [
                layer({
                    id: "torso",
                    kind: "tracking",
                    pose: { upperChest: DELTA, spine: DELTA },
                    ownedBones: ["upperChest", "spine"],
                }),
            ],
        });

        expect(result.finalPose.upperChest).toBeUndefined();
        expect(result.finalPose.spine).toBeDefined();
        expect(result.suppressedLayers).toEqual([
            {
                id: "torso",
                kind: "tracking",
                bone: "upperChest",
                reason: "missing_optional_bone",
            },
        ]);
    });

    it("keeps final owned bones in composer order without duplicates", () => {
        const fallback = createTorsoFallbackLayer({
            id: "torso-fallback",
            profile: profileWithTorso({
                bones: { spine: true, chest: true, upperChest: true },
                distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 },
            }),
            delta: DELTA,
            weight: 1,
        });
        const result = composeVrmPose({
            profile: COMPLETE_PROFILE,
            layers: [
                layer({
                    id: "torso-style",
                    kind: "style",
                    blendMode: "additive",
                    pose: { chest: DELTA },
                    ownedBones: ["chest"],
                }),
                fallback,
            ],
        });

        expect(result.ownedBones).toEqual(["spine", "chest", "upperChest"]);
        expect(new Set(result.ownedBones).size).toBe(result.ownedBones.length);
        expect(result.warnings).toEqual(["owned_bone_conflict:chest"]);
    });
});

function profileWithTorso(input: {
    bones: Partial<Record<VRMHumanBoneName, boolean>>;
    distribution: AvatarMotionProfile["torso"]["distribution"];
}): AvatarMotionProfile {
    return {
        schemaVersion: "sincro.avatar-motion-profile.v1",
        model: { vrmVersion: "1.0" },
        capabilities: {
            bones: input.bones,
            fingerChains: {
                left: emptyFingerChains(),
                right: emptyFingerChains(),
            },
        },
        restLocalRotation: {},
        metrics: {
            upperArmLength: {},
            lowerArmLength: {},
            handSize: {},
        },
        torso: {
            distribution: input.distribution,
            chestFollow: 0.55,
        },
        arm: {
            reachScale: 0.92,
            lateralScale: 0.9,
            verticalScale: 0.95,
            depthCompression: 0.6,
            elbowOutwardBias: 0.25,
            shoulderDamping: 0.55,
        },
        wrist: {
            wristRollInfluence: 0.4,
            lowerArmTwistShare: 0.65,
            handTwistShare: 0.35,
        },
        fingers: {
            curlScale: 0.8,
            curlMode: "grouped",
            curlDistribution: { proximal: 0.5, intermediate: 0.3, distal: 0.2 },
            splayLimitDeg: 12,
        },
        risk: {
            smallBodyLargeHead: 0,
            missingUpperChest: input.bones.upperChest !== true,
            missingShoulders: false,
            constraintRisk: 0,
        },
        warnings: [],
    };
}

function emptyFingerChains(): AvatarMotionProfile["capabilities"]["fingerChains"]["left"] {
    const missing = { proximal: false, intermediate: false, distal: false };
    return {
        thumb: { ...missing },
        index: { ...missing },
        middle: { ...missing },
        ring: { ...missing },
        little: { ...missing },
    };
}
