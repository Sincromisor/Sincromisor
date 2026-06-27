import { describe, expect, it } from "vitest";
import type { AvatarMotionProfile } from "../../avatarProfile/avatarMotionProfile";
import { type ArmMotionIntent, createDefaultMotionIntentState } from "../motionIntentState";
import { createSemanticMotionPoseLayer } from "../semanticMotionPoseLayer";

const PROFILE: AvatarMotionProfile = {
    schemaVersion: "sincro.avatar-motion-profile.v1",
    model: { vrmVersion: "1.0", modelName: "test" },
    capabilities: {
        bones: {
            hips: true,
            spine: true,
            chest: true,
            upperChest: true,
            neck: true,
            head: true,
            leftUpperArm: true,
            leftLowerArm: true,
            leftHand: true,
            rightUpperArm: true,
            rightLowerArm: true,
            rightHand: true,
        },
        fingerChains: {
            left: {
                thumb: { proximal: true, intermediate: true, distal: true },
                index: { proximal: true, intermediate: true, distal: true },
                middle: { proximal: true, intermediate: true, distal: true },
                ring: { proximal: true, intermediate: true, distal: true },
                little: { proximal: true, intermediate: true, distal: true },
            },
            right: {
                thumb: { proximal: true, intermediate: true, distal: true },
                index: { proximal: true, intermediate: true, distal: true },
                middle: { proximal: true, intermediate: true, distal: true },
                ring: { proximal: true, intermediate: true, distal: true },
                little: { proximal: true, intermediate: true, distal: true },
            },
        },
    },
    restLocalRotation: {},
    metrics: {
        shoulderWidth: 0.32,
        torsoLength: 0.52,
        headSize: 0.16,
        upperArmLength: { left: 0.24, right: 0.24 },
        lowerArmLength: { left: 0.22, right: 0.22 },
        handSize: { left: 0.08, right: 0.08 },
    },
    torso: { distribution: { spine: 0.25, chest: 0.4, upperChest: 0.35 }, chestFollow: 0.55 },
    arm: {
        reachScale: 0.9,
        lateralScale: 0.9,
        verticalScale: 0.95,
        depthCompression: 0.6,
        elbowOutwardBias: 0.25,
        shoulderDamping: 0.55,
    },
    wrist: { wristRollInfluence: 0.4, lowerArmTwistShare: 0.65, handTwistShare: 0.35 },
    fingers: {
        curlScale: 0.8,
        curlMode: "grouped",
        curlDistribution: { proximal: 0.5, intermediate: 0.3, distal: 0.2 },
        splayLimitDeg: 12,
    },
    risk: {
        smallBodyLargeHead: 0,
        missingUpperChest: false,
        missingShoulders: false,
        constraintRisk: 0,
    },
    warnings: [],
};

describe("createSemanticMotionPoseLayer", () => {
    it("returns a valid no-op debug snapshot for tracking, guarded, and single clap-like intents", () => {
        const tracking = createSemanticMotionPoseLayer({
            intent: createIntentState("tracking", "tracking"),
            profile: PROFILE,
        });
        const guarded = createSemanticMotionPoseLayer({
            intent: createIntentState("guarded", "tracking"),
            profile: PROFILE,
        });
        const singleClap = createSemanticMotionPoseLayer({
            intent: createIntentState("clapLike", "tracking"),
            profile: PROFILE,
        });

        expect(tracking.layers).toEqual([]);
        expect(tracking.debug).toMatchObject({
            schemaVersion: "sincro.phase9-semantic-motion.v1",
            timestamp: { mediaTimeMs: 1234 },
        });
        expect(tracking.debug.presets.map((preset) => preset.presetId)).toEqual(["none", "none"]);
        expect(guarded.layers).toEqual([]);
        expect(guarded.debug.warnings).toContain("guarded_semantic_pose_deferred");
        expect(singleClap.layers).toEqual([]);
        expect(singleClap.debug.warnings).toContain("clap_like_requires_both_hands");
    });

    it("maps semantic intents to side-local partial arm layers without torso ownership", () => {
        const result = createSemanticMotionPoseLayer({
            intent: createIntentState("wave", "pointing"),
            profile: PROFILE,
        });

        expect(result.layers.map((layer) => layer.id)).toEqual([
            "semantic:left:small_wave",
            "semantic:right:point_forward_or_up",
        ]);
        expect(result.layers[0]?.kind).toBe("semantic");
        expect(result.layers[0]?.blendMode).toBe("additive");
        expect(result.layers[1]?.blendMode).toBe("override");
        expect(Object.keys(result.layers[0]?.pose ?? {}).sort()).toEqual([
            "leftHand",
            "leftLowerArm",
            "leftUpperArm",
        ]);
        expect(result.layers[0]?.ownedBones).not.toContain("spine");
        expect(result.layers[0]?.ownedBones).not.toContain("chest");
        expect(result.layers[0]?.ownedBones).not.toContain("head");
        expect(result.debug.presets[0]?.weights).toEqual({
            arm: 0.432,
            wrist: 0.192,
            fingers: 0.384,
            layer: 0.432,
        });
    });

    it("prefers a both-hands clap layer and stores the lower confidence in metadata", () => {
        const intent = createIntentState("clapLike", "clapLike");
        intent.arms.left.confidence = 0.85;
        intent.arms.right.confidence = 0.62;

        const result = createSemanticMotionPoseLayer({ intent, profile: PROFILE });

        expect(result.layers).toHaveLength(1);
        expect(result.layers[0]?.id).toBe("semantic:both:soft_clap_like");
        expect(result.layers[0]?.ownedBones).toEqual([
            "leftUpperArm",
            "leftLowerArm",
            "leftHand",
            "rightUpperArm",
            "rightLowerArm",
            "rightHand",
        ]);
        expect(result.layers[0]?.metadata?.semantic?.intentConfidence).toBe(0.62);
        expect(result.debug.presets).toHaveLength(1);
        expect(result.debug.presets[0]).toMatchObject({
            side: "both",
            presetId: "soft_clap_like",
        });
    });

    it("keeps lost and fallback as semantic comfort pose without full body overwrite", () => {
        const result = createSemanticMotionPoseLayer({
            intent: createIntentState("lost", "fallback"),
            profile: PROFILE,
        });

        expect(result.layers).toHaveLength(2);
        expect(result.layers.every((layer) => layer.kind === "semantic")).toBe(true);
        expect(result.layers.flatMap((layer) => layer.ownedBones)).toEqual([
            "leftUpperArm",
            "leftLowerArm",
            "leftHand",
            "rightUpperArm",
            "rightLowerArm",
            "rightHand",
        ]);
        expect(result.layers.flatMap((layer) => Object.keys(layer.pose))).not.toContain("spine");
        expect(result.debug.warnings).toEqual(["semantic_fallback_active"]);
    });

    it("records missing optional hand bones in debug while leaving composer suppression available", () => {
        const profile: AvatarMotionProfile = {
            ...PROFILE,
            capabilities: {
                ...PROFILE.capabilities,
                bones: { ...PROFILE.capabilities.bones, leftHand: false },
            },
        };

        const result = createSemanticMotionPoseLayer({
            intent: createIntentState("thumbsUp", "tracking"),
            profile,
        });

        expect(result.layers[0]?.ownedBones).toContain("leftHand");
        expect(result.debug.presets[0]?.suppressedBones).toEqual(["leftHand"]);
    });
});

function createIntentState(left: ArmMotionIntent, right: ArmMotionIntent) {
    const state = createDefaultMotionIntentState(1234);
    state.arms.left = {
        ...state.arms.left,
        intent: left,
        confidence: 0.6,
        reliability: 0.7,
        expressiveness: 0.8,
        source: "gesture",
        warnings: [],
    };
    state.arms.right = {
        ...state.arms.right,
        intent: right,
        confidence: 0.6,
        reliability: 0.7,
        expressiveness: 0.8,
        source: "gesture",
        warnings: [],
    };
    state.warnings = [];
    return state;
}
