/**
 * semantic intent ごとの authored pose preset と conflict suppression threshold を定義する。
 * VRM bone rotation は preset 由来の低振幅 delta に限定し、threshold 調整時は motion design の semantic layer と motion-debug 表示を確認する。
 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { VrmNormalizedLocalPose, VrmPoseQuaternion } from "../vrmPose/vrmPoseTypes";
import type { ArmMotionIntent } from "./motionIntentState";

const DEG_TO_RAD = Math.PI / 180;

export const SEMANTIC_CONFLICT_SUPPRESSION_THRESHOLD = 0.65;

export const SEMANTIC_MOTION_POSE_PRESET_IDS = [
    "small_wave",
    "point_forward_or_up",
    "thumbs_up_hold",
    "peace_hold",
    "shy_hand_near_face",
    "explain_open_palm",
    "soft_clap_like",
    "lost_to_comfort",
] as const;

export const SIDES = ["left", "right"] as const;

export type SemanticMotionSide = (typeof SIDES)[number];
export type SemanticMotionLayerSide = SemanticMotionSide | "both";
export type SemanticMotionPosePresetId = (typeof SEMANTIC_MOTION_POSE_PRESET_IDS)[number];

export const SIDE_BONES: Record<SemanticMotionSide, VRMHumanBoneName[]> = {
    left: ["leftUpperArm", "leftLowerArm", "leftHand"],
    right: ["rightUpperArm", "rightLowerArm", "rightHand"],
};

export function presetIdForIntent(intent: ArmMotionIntent): SemanticMotionPosePresetId | "none" {
    switch (intent) {
        case "wave":
            return "small_wave";
        case "pointing":
            return "point_forward_or_up";
        case "thumbsUp":
            return "thumbs_up_hold";
        case "peace":
            return "peace_hold";
        case "nearFace":
            return "shy_hand_near_face";
        case "explain":
            return "explain_open_palm";
        case "lost":
        case "fallback":
            return "lost_to_comfort";
        case "tracking":
        case "guarded":
        case "clapLike":
            return "none";
    }
}

export function createSidePose(
    side: SemanticMotionSide,
    presetId: SemanticMotionPosePresetId,
): VrmNormalizedLocalPose {
    const sign = side === "left" ? -1 : 1;
    const bones = SIDE_BONES[side];
    return {
        [bones[0]]: semanticQuaternion(
            0,
            sign * upperArmYawDeg(presetId),
            upperArmRollDeg(presetId),
        ),
        [bones[1]]: semanticQuaternion(
            lowerArmPitchDeg(presetId),
            0,
            sign * lowerArmRollDeg(presetId),
        ),
        [bones[2]]: semanticQuaternion(
            handPitchDeg(presetId),
            sign * handYawDeg(presetId),
            handRollDeg(presetId),
        ),
    };
}

function upperArmYawDeg(presetId: SemanticMotionPosePresetId): number {
    switch (presetId) {
        case "point_forward_or_up":
            return 8;
        case "shy_hand_near_face":
            return 12;
        case "soft_clap_like":
            return 18;
        case "lost_to_comfort":
            return 6;
        default:
            return 4;
    }
}

function upperArmRollDeg(presetId: SemanticMotionPosePresetId): number {
    return presetId === "lost_to_comfort" ? -8 : 0;
}

function lowerArmPitchDeg(presetId: SemanticMotionPosePresetId): number {
    switch (presetId) {
        case "small_wave":
            return 10;
        case "point_forward_or_up":
            return -18;
        case "shy_hand_near_face":
            return -32;
        case "soft_clap_like":
            return -26;
        case "lost_to_comfort":
            return 30;
        default:
            return -10;
    }
}

function lowerArmRollDeg(presetId: SemanticMotionPosePresetId): number {
    return presetId === "small_wave" ? 8 : 5;
}

function handPitchDeg(presetId: SemanticMotionPosePresetId): number {
    switch (presetId) {
        case "thumbs_up_hold":
            return -18;
        case "peace_hold":
            return -8;
        case "lost_to_comfort":
            return 16;
        default:
            return 0;
    }
}

function handYawDeg(presetId: SemanticMotionPosePresetId): number {
    return presetId === "small_wave" ? 14 : 4;
}

function handRollDeg(presetId: SemanticMotionPosePresetId): number {
    return presetId === "explain_open_palm" ? -10 : 0;
}

function semanticQuaternion(xDeg: number, yDeg: number, zDeg: number): VrmPoseQuaternion {
    const quaternion = new Quaternion().setFromEuler(
        new Euler(xDeg * DEG_TO_RAD, yDeg * DEG_TO_RAD, zDeg * DEG_TO_RAD, "XYZ"),
    );
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}
