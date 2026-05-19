import { type VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { Euler } from "three/src/math/Euler.js";

const OPTIONAL_MOTION_BONE_NAMES = {
    hips: VRMHumanBoneName.Hips,
    spine: VRMHumanBoneName.Spine,
    chest: VRMHumanBoneName.Chest,
    upperChest: VRMHumanBoneName.UpperChest,
    leftShoulder: VRMHumanBoneName.LeftShoulder,
    rightShoulder: VRMHumanBoneName.RightShoulder,
} as const;

export type OptionalMotionBoneName = keyof typeof OPTIONAL_MOTION_BONE_NAMES;

const OPTIONAL_MOTION_BONE_NAME_LIST: OptionalMotionBoneName[] = [
    "hips",
    "spine",
    "chest",
    "upperChest",
    "leftShoulder",
    "rightShoulder",
];

export type CharacterMotionBone = {
    node: Object3D;
    baseRotation: Euler;
};

export function captureOptionalMotionBone(
    vrm: VRM,
    name: OptionalMotionBoneName,
): CharacterMotionBone | undefined {
    const node = vrm.humanoid.getNormalizedBoneNode(OPTIONAL_MOTION_BONE_NAMES[name]);
    if (!node) {
        return undefined;
    }
    return {
        node,
        baseRotation: node.rotation.clone(),
    };
}

export function captureOptionalMotionBones(
    vrm: VRM,
): Map<OptionalMotionBoneName, CharacterMotionBone> {
    const bones = new Map<OptionalMotionBoneName, CharacterMotionBone>();
    for (const name of OPTIONAL_MOTION_BONE_NAME_LIST) {
        const bone = captureOptionalMotionBone(vrm, name);
        if (bone) {
            bones.set(name, bone);
        }
    }
    return bones;
}
