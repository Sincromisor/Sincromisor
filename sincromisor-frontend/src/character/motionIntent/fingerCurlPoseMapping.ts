/**
 * finger curl group を VRM humanoid bone quaternion へ写す mapping helper。
 * profile の curl distribution と splay limit を尊重し、per-finger raw landmark rotation は生成しない。
 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import type { SincroHandMotionSnapshot } from "../../features/gaze/handTracking/sincroHandMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfile";
import type { VrmNormalizedLocalPose } from "../vrmPose/vrmPoseTypes";
import type { FingerCurlGroupState, FingerCurlPoseLayerInput } from "./fingerCurlPoseLayer";

const CURL_MAX_DEG = 70;
const PROXIMAL_ONLY_CURL_LIMIT_SCALE = 0.65;
const THUMB_OPPOSE_MAX_DEG = 22;
const DEFAULT_DISTRIBUTION: FingerCurlDistribution = {
    proximal: 0.5,
    intermediate: 0.3,
    distal: 0.2,
};
const CURL_AXIS = new Vector3(1, 0, 0);
const OPPOSE_AXIS = new Vector3(0, 1, 0);
const SPLAY_AXIS = new Vector3(0, 0, 1);

export type FingerCurlSide = "left" | "right";
export type FingerCurlGroup = "thumb" | "index" | "middle" | "ringLittle";
type FingerName = "thumb" | "index" | "middle" | "ring" | "little";
type FingerChainPart = "proximal" | "intermediate" | "distal";
export type FingerCurlDistribution = Record<FingerChainPart, number>;

export const FINGER_CURL_GROUPS: FingerCurlGroup[] = ["thumb", "index", "middle", "ringLittle"];

const FINGER_CHAIN_PARTS: FingerChainPart[] = ["proximal", "intermediate", "distal"];

const GROUP_FINGERS: Record<FingerCurlGroup, FingerName[]> = {
    thumb: ["thumb"],
    index: ["index"],
    middle: ["middle"],
    ringLittle: ["ring", "little"],
};

const FINGER_BONES: Record<
    FingerCurlSide,
    Record<FingerName, Record<FingerChainPart, VRMHumanBoneName>>
> = {
    left: {
        thumb: {
            proximal: "leftThumbProximal",
            intermediate: "leftThumbMetacarpal",
            distal: "leftThumbDistal",
        },
        index: {
            proximal: "leftIndexProximal",
            intermediate: "leftIndexIntermediate",
            distal: "leftIndexDistal",
        },
        middle: {
            proximal: "leftMiddleProximal",
            intermediate: "leftMiddleIntermediate",
            distal: "leftMiddleDistal",
        },
        ring: {
            proximal: "leftRingProximal",
            intermediate: "leftRingIntermediate",
            distal: "leftRingDistal",
        },
        little: {
            proximal: "leftLittleProximal",
            intermediate: "leftLittleIntermediate",
            distal: "leftLittleDistal",
        },
    },
    right: {
        thumb: {
            proximal: "rightThumbProximal",
            intermediate: "rightThumbMetacarpal",
            distal: "rightThumbDistal",
        },
        index: {
            proximal: "rightIndexProximal",
            intermediate: "rightIndexIntermediate",
            distal: "rightIndexDistal",
        },
        middle: {
            proximal: "rightMiddleProximal",
            intermediate: "rightMiddleIntermediate",
            distal: "rightMiddleDistal",
        },
        ring: {
            proximal: "rightRingProximal",
            intermediate: "rightRingIntermediate",
            distal: "rightRingDistal",
        },
        little: {
            proximal: "rightLittleProximal",
            intermediate: "rightLittleIntermediate",
            distal: "rightLittleDistal",
        },
    },
};

export function normalizedProfileDistribution(
    profile: AvatarMotionProfile,
    warnings: Set<string>,
): FingerCurlDistribution {
    const distribution = profile.fingers.curlDistribution;
    const sum = distribution.proximal + distribution.intermediate + distribution.distal;
    if (!Number.isFinite(sum) || Math.abs(sum - 1) > 0.001) {
        warnings.add("invalid_finger_curl_distribution_profile_defaulted");
        return { ...DEFAULT_DISTRIBUTION };
    }
    return { ...distribution };
}

export function addGroupPose(
    input: FingerCurlPoseLayerInput,
    groupState: FingerCurlGroupState,
    distribution: FingerCurlDistribution,
    pose: VrmNormalizedLocalPose,
    ownedBones: VRMHumanBoneName[],
    warnings: Set<string>,
): void {
    const available = availableGroupBones(input, groupState.group, distribution);
    if (available.length === 0) {
        const warning = `missing_finger_chain:${input.side}:${groupState.group}`;
        warnings.add(warning);
        groupState.warnings.push(warning);
        return;
    }
    for (const bone of available) {
        pose[bone.name] = createFingerQuaternion(input, groupState, bone);
        addOwnedBone(ownedBones, bone.name);
    }
}

function availableGroupBones(
    input: FingerCurlPoseLayerInput,
    group: FingerCurlGroup,
    distribution: FingerCurlDistribution,
): Array<{ name: VRMHumanBoneName; part: FingerChainPart; weight: number; finger: FingerName }> {
    const bones = availableRawBones(input, group, distribution);
    const weightSum = bones.reduce((sum, bone) => sum + bone.rawWeight, 0);
    if (weightSum <= 0) {
        return [];
    }
    const proximalOnly = bones.length === 1 && bones[0]?.part === "proximal";
    return bones.map((bone) => ({
        name: bone.name,
        part: bone.part,
        weight: proximalOnly ? PROXIMAL_ONLY_CURL_LIMIT_SCALE : bone.rawWeight / weightSum,
        finger: bone.finger,
    }));
}

function availableRawBones(
    input: FingerCurlPoseLayerInput,
    group: FingerCurlGroup,
    distribution: FingerCurlDistribution,
): Array<{ name: VRMHumanBoneName; part: FingerChainPart; rawWeight: number; finger: FingerName }> {
    const bones: Array<{
        name: VRMHumanBoneName;
        part: FingerChainPart;
        rawWeight: number;
        finger: FingerName;
    }> = [];
    for (const finger of GROUP_FINGERS[group]) {
        const chain = input.profile.capabilities.fingerChains[input.side][finger];
        for (const part of FINGER_CHAIN_PARTS) {
            if (chain[part]) {
                bones.push({
                    name: FINGER_BONES[input.side][finger][part],
                    part,
                    rawWeight: distribution[part],
                    finger,
                });
            }
        }
    }
    return bones;
}

function createFingerQuaternion(
    input: FingerCurlPoseLayerInput,
    groupState: FingerCurlGroupState,
    bone: { part: FingerChainPart; weight: number; finger: FingerName },
): { x: number; y: number; z: number; w: number } {
    const curlDeg = CURL_MAX_DEG * groupState.curl * bone.weight;
    const splayDeg = splayDegrees(input, groupState.group, bone.finger);
    const opposeDeg = thumbOpposeDegrees(input, groupState.group, bone.part, bone.finger);
    const curl = new Quaternion().setFromAxisAngle(CURL_AXIS, MathUtils.degToRad(-curlDeg));
    const splay = new Quaternion().setFromAxisAngle(SPLAY_AXIS, MathUtils.degToRad(splayDeg));
    const oppose = new Quaternion().setFromAxisAngle(OPPOSE_AXIS, MathUtils.degToRad(opposeDeg));
    const final = oppose.multiply(splay).multiply(curl).normalize();
    return { x: final.x, y: final.y, z: final.z, w: final.w };
}

function splayDegrees(
    input: FingerCurlPoseLayerInput,
    group: FingerCurlGroup,
    finger: FingerName,
): number {
    if (group === "thumb") {
        return 0;
    }
    const features =
        input.side === "left" ? input.hand.leftHand.features : input.hand.rightHand.features;
    const sideSign = input.side === "left" ? 1 : -1;
    return (
        sideSign * clamp01(fingerSplayValue(finger, features)) * input.profile.fingers.splayLimitDeg
    );
}

function fingerSplayValue(
    finger: FingerName,
    features: SincroHandMotionSnapshot["leftHand"]["features"],
): number {
    if (finger === "index") {
        return features.fingerSplay.indexMiddle;
    }
    if (finger === "middle") {
        return features.fingerSplay.middleRing;
    }
    return features.fingerSplay.ringLittle;
}

function thumbOpposeDegrees(
    input: FingerCurlPoseLayerInput,
    group: FingerCurlGroup,
    part: FingerChainPart,
    finger: FingerName,
): number {
    if (group !== "thumb" || finger !== "thumb" || part !== firstAvailableThumbPart(input)) {
        return 0;
    }
    const features =
        input.side === "left" ? input.hand.leftHand.features : input.hand.rightHand.features;
    const sideSign = input.side === "left" ? 1 : -1;
    return sideSign * clamp01(features.thumbOppose) * THUMB_OPPOSE_MAX_DEG;
}

function firstAvailableThumbPart(input: FingerCurlPoseLayerInput): FingerChainPart | undefined {
    const chain = input.profile.capabilities.fingerChains[input.side].thumb;
    return FINGER_CHAIN_PARTS.find((part) => chain[part]);
}

function addOwnedBone(ownedBones: VRMHumanBoneName[], bone: VRMHumanBoneName): void {
    if (!ownedBones.includes(bone)) {
        ownedBones.push(bone);
    }
}

function clamp01(value: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(1, value));
}
