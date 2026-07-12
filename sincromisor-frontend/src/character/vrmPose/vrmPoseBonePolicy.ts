import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { AvatarOptionalBoneCapabilities } from "../avatarProfile/minimalAvatarMotionProfile";

export type ArmSide = "left" | "right";

const LEFT_ARM_BONES: VRMHumanBoneName[] = [
    "leftShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
];
const RIGHT_ARM_BONES: VRMHumanBoneName[] = [
    "rightShoulder",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
];
const LEFT_FINGER_BONES: VRMHumanBoneName[] = [
    "leftThumbMetacarpal",
    "leftThumbProximal",
    "leftThumbDistal",
    "leftIndexProximal",
    "leftIndexIntermediate",
    "leftIndexDistal",
    "leftMiddleProximal",
    "leftMiddleIntermediate",
    "leftMiddleDistal",
    "leftRingProximal",
    "leftRingIntermediate",
    "leftRingDistal",
    "leftLittleProximal",
    "leftLittleIntermediate",
    "leftLittleDistal",
];
const RIGHT_FINGER_BONES: VRMHumanBoneName[] = [
    "rightThumbMetacarpal",
    "rightThumbProximal",
    "rightThumbDistal",
    "rightIndexProximal",
    "rightIndexIntermediate",
    "rightIndexDistal",
    "rightMiddleProximal",
    "rightMiddleIntermediate",
    "rightMiddleDistal",
    "rightRingProximal",
    "rightRingIntermediate",
    "rightRingDistal",
    "rightLittleProximal",
    "rightLittleIntermediate",
    "rightLittleDistal",
];
const TORSO_BONES: VRMHumanBoneName[] = ["spine", "chest", "upperChest"];
const REQUIRED_ARM_BONES: VRMHumanBoneName[] = [
    "leftUpperArm",
    "leftLowerArm",
    "rightUpperArm",
    "rightLowerArm",
];
const OPTIONAL_BONE_KEYS: Partial<Record<VRMHumanBoneName, keyof AvatarOptionalBoneCapabilities>> =
    {
        upperChest: "upperChest",
        leftShoulder: "leftShoulder",
        rightShoulder: "rightShoulder",
        leftHand: "leftHand",
        rightHand: "rightHand",
        leftThumbProximal: "leftThumbProximal",
        rightThumbProximal: "rightThumbProximal",
        leftIndexProximal: "leftIndexProximal",
        rightIndexProximal: "rightIndexProximal",
    };

export function isSupportedOwnedBone(bone: VRMHumanBoneName): boolean {
    return (
        REQUIRED_ARM_BONES.includes(bone) ||
        TORSO_BONES.includes(bone) ||
        LEFT_ARM_BONES.includes(bone) ||
        RIGHT_ARM_BONES.includes(bone) ||
        LEFT_FINGER_BONES.includes(bone) ||
        RIGHT_FINGER_BONES.includes(bone)
    );
}

export function isAvailableBone(
    bone: VRMHumanBoneName,
    optionalBones: AvatarOptionalBoneCapabilities,
): boolean {
    if (REQUIRED_ARM_BONES.includes(bone)) {
        return true;
    }
    if (bone === "spine" || bone === "chest") {
        return true;
    }
    const optionalKey = OPTIONAL_BONE_KEYS[bone];
    if (optionalKey !== undefined) {
        return optionalBones[optionalKey];
    }
    return LEFT_FINGER_BONES.includes(bone) || RIGHT_FINGER_BONES.includes(bone);
}

export function missingShoulderFallbackBone(
    bone: VRMHumanBoneName,
    optionalBones: AvatarOptionalBoneCapabilities,
): VRMHumanBoneName | undefined {
    if (bone === "leftShoulder" && !optionalBones.leftShoulder) {
        return "leftUpperArm";
    }
    if (bone === "rightShoulder" && !optionalBones.rightShoulder) {
        return "rightUpperArm";
    }
    return undefined;
}

export function armSide(bone: VRMHumanBoneName): ArmSide | undefined {
    if (LEFT_ARM_BONES.includes(bone) || LEFT_FINGER_BONES.includes(bone)) {
        return "left";
    }
    if (RIGHT_ARM_BONES.includes(bone) || RIGHT_FINGER_BONES.includes(bone)) {
        return "right";
    }
    return undefined;
}
