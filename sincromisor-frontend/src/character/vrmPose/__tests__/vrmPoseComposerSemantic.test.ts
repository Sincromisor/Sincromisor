import { describe, expect, it } from "vitest";
import type { MinimalAvatarMotionProfile } from "../../avatarProfile/minimalAvatarMotionProfile";
import { composeVrmPose } from "../vrmPoseComposer";
import {
    COMPLETE_PROFILE,
    eulerQuaternion,
    expectNormalizedQuaternion,
    layer,
} from "./vrmPoseComposerTestHelpers";

describe("composeVrmPose semantic layers", () => {
    it("suppresses semantic overrides on tracking-owned arm bones below fixed confidence", () => {
        const result = composeVrmPose({
            profile: COMPLETE_PROFILE,
            layers: [
                layer({
                    id: "tracking",
                    kind: "tracking",
                    pose: { rightHand: eulerQuaternion(0, 0.1, 0) },
                    ownedBones: ["rightHand"],
                }),
                layer({
                    id: "semantic:right:peace_hold",
                    kind: "semantic",
                    pose: { rightHand: eulerQuaternion(0, 0.7, 0) },
                    ownedBones: ["rightHand"],
                    metadata: {
                        semantic: {
                            side: "right",
                            intent: "peace",
                            intentConfidence: 0.64,
                            conflictSuppressionThreshold: 0,
                        },
                    },
                }),
            ],
        });

        expectNormalizedQuaternion(result.finalPose.rightHand, eulerQuaternion(0, 0.1, 0));
        expect(result.suppressedLayers).toContainEqual({
            id: "semantic:right:peace_hold",
            kind: "semantic",
            bone: "rightHand",
            reason: "semantic_conflict",
        });
    });

    it("treats semantic layers without metadata as zero confidence during tracking conflict", () => {
        const result = composeVrmPose({
            profile: COMPLETE_PROFILE,
            layers: [
                layer({
                    id: "tracking",
                    kind: "tracking",
                    pose: { leftUpperArm: eulerQuaternion(0, 0.1, 0) },
                    ownedBones: ["leftUpperArm"],
                }),
                layer({
                    id: "semantic:left:small_wave",
                    kind: "semantic",
                    pose: { leftUpperArm: eulerQuaternion(0, 0.5, 0) },
                    ownedBones: ["leftUpperArm"],
                }),
            ],
        });

        expectNormalizedQuaternion(result.finalPose.leftUpperArm, eulerQuaternion(0, 0.1, 0));
        expect(result.suppressedLayers).toContainEqual({
            id: "semantic:left:small_wave",
            kind: "semantic",
            bone: "leftUpperArm",
            reason: "semantic_conflict",
        });
    });

    it("suppresses zero weight and missing optional semantic hand bones through existing rules", () => {
        const profile: MinimalAvatarMotionProfile = {
            ...COMPLETE_PROFILE,
            optionalBones: { ...COMPLETE_PROFILE.optionalBones, leftHand: false },
        };
        const result = composeVrmPose({
            profile,
            layers: [
                layer({
                    id: "semantic:left:thumbs_up_hold",
                    kind: "semantic",
                    weight: 0,
                    pose: {
                        leftHand: eulerQuaternion(0, 0, 0.2),
                        leftLowerArm: eulerQuaternion(0.2, 0, 0),
                    },
                    ownedBones: ["leftHand", "leftLowerArm"],
                    metadata: {
                        semantic: {
                            side: "left",
                            intent: "thumbsUp",
                            intentConfidence: 0.9,
                            conflictSuppressionThreshold: 0.65,
                        },
                    },
                }),
            ],
        });

        expect(result.finalPose.leftHand).toBeUndefined();
        expect(result.finalPose.leftLowerArm).toBeUndefined();
        expect(result.suppressedLayers).toEqual([
            {
                id: "semantic:left:thumbs_up_hold",
                kind: "semantic",
                bone: "leftHand",
                reason: "missing_optional_bone",
            },
            {
                id: "semantic:left:thumbs_up_hold",
                kind: "semantic",
                bone: "leftLowerArm",
                reason: "zero_weight",
            },
        ]);
    });
});
