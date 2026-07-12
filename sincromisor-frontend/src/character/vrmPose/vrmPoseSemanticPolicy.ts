import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { VrmPoseLayer } from "./vrmPoseTypes";

const SEMANTIC_CONFLICT_CONFIDENCE_THRESHOLD = 0.65;

export function shouldSuppressSemanticConflict(
    layer: VrmPoseLayer,
    bone: VRMHumanBoneName,
    trackingOwnsBone: boolean,
): boolean {
    if (layer.kind !== "semantic" || !trackingOwnsBone || !isSemanticArmOverrideBone(bone)) {
        return false;
    }
    const confidence = layer.metadata?.semantic?.intentConfidence ?? 0;
    return confidence < SEMANTIC_CONFLICT_CONFIDENCE_THRESHOLD;
}

function isSemanticArmOverrideBone(bone: VRMHumanBoneName): boolean {
    return (
        bone === "leftUpperArm" ||
        bone === "leftLowerArm" ||
        bone === "leftHand" ||
        bone === "rightUpperArm" ||
        bone === "rightLowerArm" ||
        bone === "rightHand"
    );
}
