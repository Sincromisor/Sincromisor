import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import type { SincroArmSide } from "./sincroArmIkTypes";

export type SincroArmIkSkeleton = {
    side: SincroArmSide;
    upperArmNode: Object3D;
    lowerArmNode: Object3D;
    handNode: Object3D;
    oppositeUpperArmNode: Object3D;
    headNode?: Object3D;
    chestNode?: Object3D;
};

export function captureSincroArmIkSkeleton(
    vrm: VRM,
    side: SincroArmSide,
): SincroArmIkSkeleton | undefined {
    vrm.scene.updateMatrixWorld(true);
    const upperArmNode = getNode(vrm, `${side}UpperArm` as VRMHumanBoneName);
    const lowerArmNode = getNode(vrm, `${side}LowerArm` as VRMHumanBoneName);
    const handNode = getNode(vrm, `${side}Hand` as VRMHumanBoneName);
    const oppositeUpperArmNode = getNode(
        vrm,
        `${side === "left" ? "right" : "left"}UpperArm` as VRMHumanBoneName,
    );
    if (!upperArmNode || !lowerArmNode || !handNode || !oppositeUpperArmNode) {
        return undefined;
    }
    return {
        side,
        upperArmNode,
        lowerArmNode,
        handNode,
        oppositeUpperArmNode,
        headNode: getNode(vrm, "head" as VRMHumanBoneName),
        chestNode: firstNode(vrm, [
            "upperChest" as VRMHumanBoneName,
            "chest" as VRMHumanBoneName,
            "spine" as VRMHumanBoneName,
        ]),
    };
}

function getNode(vrm: VRM, name: VRMHumanBoneName): Object3D | undefined {
    return vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
}

function firstNode(vrm: VRM, names: VRMHumanBoneName[]): Object3D | undefined {
    for (const name of names) {
        const node = getNode(vrm, name);
        if (node) {
            return node;
        }
    }
    return undefined;
}
