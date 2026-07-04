import { Object3D } from "three/src/core/Object3D.js";
import { Euler } from "three/src/math/Euler.js";
import { describe, expect, it } from "vitest";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import { NEUTRAL_POSE_FRAME } from "../../retargeting/sincroPoseRetargetTypes";
import { COMPLETE_PROFILE } from "../../vrmPose/__tests__/vrmPoseComposerTestHelpers";
import { getAiSpeechExpressionMotionProfile } from "../characterMotionExpression";
import {
    type CharacterMotionTorsoShoulderMotionInput,
    composeTorsoShoulderApplication,
    createTorsoShoulderComposerLayer,
} from "../characterMotionTorsoComposerLayer";

describe("character motion torso composer layer", () => {
    it("uses profile torso distribution and skips missing upperChest without throwing", () => {
        const profile = profileWith({
            optionalBones: { upperChest: false },
            distribution: { spine: 0.35, chest: 0.65, upperChest: 0 },
        });
        const application = composeTorsoShoulderApplication({
            bones: createBones({ upperChest: false }),
            motion: createMotion(),
            profile,
        });

        expect(application.result.finalPose.spine).toBeDefined();
        expect(application.result.finalPose.chest).toBeDefined();
        expect(application.result.finalPose.upperChest).toBeUndefined();
        expect(application.result.ownedBones).not.toContain("upperChest");
        expect(application.warnings).not.toContain("owned_bone_conflict:upperChest");
    });

    it("falls back missing shoulder correction only to the same-side upperArm boundary", () => {
        const profile = profileWith({
            optionalBones: { leftShoulder: false },
        });
        const application = composeTorsoShoulderApplication({
            bones: createBones({ leftShoulder: false }),
            motion: createMotion(),
            profile,
        });

        expect(application.result.finalPose.leftShoulder).toBeUndefined();
        expect(application.result.finalPose.leftUpperArm).toBeDefined();
        expect(application.result.finalPose.head).toBeUndefined();
        expect(application.result.finalPose.neck).toBeUndefined();
        expect(application.result.finalPose.leftUpperLeg).toBeUndefined();
        expect(application.result.finalPose.leftThumbProximal).toBeUndefined();
        expect(application.result.suppressedLayers).toContainEqual({
            id: "production:torso-shoulder",
            kind: "tracking",
            bone: "leftShoulder",
            reason: "missing_optional_bone",
        });
    });

    it("keeps invalid profile distribution observable and falls back to capability defaults", () => {
        const { layer, warnings } = createTorsoShoulderComposerLayer({
            bones: createBones(),
            motion: createMotion(),
            profile: profileWith({
                distribution: { spine: 1, chest: 1, upperChest: 1 },
            }),
        });

        expect(warnings).toEqual(["invalid_torso_distribution_profile_defaulted"]);
        expect(layer.ownedBones).toEqual([
            "spine",
            "chest",
            "upperChest",
            "leftShoulder",
            "rightShoulder",
        ]);
    });
});

function createMotion(): CharacterMotionTorsoShoulderMotionInput {
    const pose = structuredClone(NEUTRAL_POSE_FRAME);
    pose.active = true;
    pose.upperBody.spine = { x: 0.02, y: 0.04, z: 0.01 };
    pose.upperBody.chest = { x: 0.03, y: -0.02, z: 0.05 };
    pose.upperBody.leftShoulder = { x: 0, y: 0, z: 0.08 };
    pose.upperBody.rightShoulder = { x: 0, y: 0, z: -0.06 };
    return {
        breathWave: 0.4,
        secondaryWave: -0.2,
        sideWave: 0.3,
        intensity: 0.9,
        listening: 0.2,
        backchannelNod: 0.1,
        aiSpeaking: 0.3,
        aiGesture: 0.5,
        aiSpeechBeatDirection: 1,
        expression: getAiSpeechExpressionMotionProfile(undefined),
        motionScale: 0.8,
        pose,
    };
}

function createBones(
    present: Partial<Record<"upperChest" | "leftShoulder" | "rightShoulder", boolean>> = {},
) {
    const names = [
        "spine",
        "chest",
        "upperChest",
        "leftShoulder",
        "rightShoulder",
        "leftUpperArm",
        "rightUpperArm",
    ] as const;
    const bones = new Map();
    for (const name of names) {
        if (
            (name === "upperChest" || name === "leftShoulder" || name === "rightShoulder") &&
            present[name] === false
        ) {
            continue;
        }
        const node = new Object3D();
        node.rotation.copy(new Euler(0.01, 0.02, -0.03, "XYZ"));
        bones.set(name, {
            node,
            baseRotation: node.rotation.clone(),
        });
    }
    return bones;
}

function profileWith(input: {
    optionalBones?: Partial<MinimalAvatarMotionProfile["optionalBones"]>;
    distribution?: MinimalAvatarMotionProfile["torso"]["distribution"];
}): MinimalAvatarMotionProfile {
    return {
        ...COMPLETE_PROFILE,
        optionalBones: {
            ...COMPLETE_PROFILE.optionalBones,
            ...input.optionalBones,
        },
        torso: {
            distribution: input.distribution ?? COMPLETE_PROFILE.torso.distribution,
        },
    };
}
