import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { SincroArmSide } from "./sincroArmIkTypes";

export type SincroArmIkVrmSource = {
    scene: Pick<VRM["scene"], "updateMatrixWorld">;
    humanoid: Pick<VRM["humanoid"], "getNormalizedBoneNode">;
};

export type SincroArmIkSkeleton = {
    side: SincroArmSide;
    upperArmNode: Object3D;
    lowerArmNode: Object3D;
    handNode: Object3D;
    oppositeUpperArmNode: Object3D;
    headNode?: Object3D;
    chestNode?: Object3D;
};

const ARM_BONE_NAMES: Record<
    SincroArmSide,
    {
        upperArm: VRMHumanBoneName;
        lowerArm: VRMHumanBoneName;
        hand: VRMHumanBoneName;
        oppositeUpperArm: VRMHumanBoneName;
    }
> = {
    left: {
        upperArm: "leftUpperArm",
        lowerArm: "leftLowerArm",
        hand: "leftHand",
        oppositeUpperArm: "rightUpperArm",
    },
    right: {
        upperArm: "rightUpperArm",
        lowerArm: "rightLowerArm",
        hand: "rightHand",
        oppositeUpperArm: "leftUpperArm",
    },
};

const TORSO_BONE_FALLBACKS: VRMHumanBoneName[] = ["upperChest", "chest", "spine"];

export function captureSincroArmIkSkeleton(
    vrm: SincroArmIkVrmSource,
    side: SincroArmSide,
): SincroArmIkSkeleton | undefined {
    vrm.scene.updateMatrixWorld(true);
    const names = ARM_BONE_NAMES[side];
    const upperArmNode = getNode(vrm, names.upperArm);
    const lowerArmNode = getNode(vrm, names.lowerArm);
    const handNode = getNode(vrm, names.hand);
    const oppositeUpperArmNode = getNode(vrm, names.oppositeUpperArm);
    if (!upperArmNode || !lowerArmNode || !handNode || !oppositeUpperArmNode) {
        return undefined;
    }
    return {
        side,
        upperArmNode,
        lowerArmNode,
        handNode,
        oppositeUpperArmNode,
        headNode: getNode(vrm, "head"),
        chestNode: firstNode(vrm, TORSO_BONE_FALLBACKS),
    };
}

function getNode(vrm: SincroArmIkVrmSource, name: VRMHumanBoneName): Object3D | undefined {
    return vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
}

function firstNode(vrm: SincroArmIkVrmSource, names: VRMHumanBoneName[]): Object3D | undefined {
    for (const name of names) {
        const node = getNode(vrm, name);
        if (node) {
            return node;
        }
    }
    return undefined;
}
