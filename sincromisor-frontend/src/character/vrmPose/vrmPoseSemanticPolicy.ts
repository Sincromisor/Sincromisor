/** 意図の確信度と追跡品質を分け、実観測のある腕を補助姿勢で置き換えない。 */
import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { VrmPoseLayer } from "./vrmPoseTypes";

/** 高信頼の観測を250ms保護し、その後は腕の予測期限700msまで連続して保護を弱める。 */
export function trackingProtectionWeight(layer: VrmPoseLayer): number {
    const quality = layer.metadata?.tracking;
    const confidence = quality?.confidence ?? layer.weight;
    const age = quality?.observedAgeMs ?? 0;
    if (!Number.isFinite(confidence) || !Number.isFinite(age) || age < 0) return 0;
    return (
        Math.max(0, Math.min(1, confidence / 0.65)) * Math.max(0, 1 - Math.max(0, age - 250) / 450)
    );
}

/** 腕だけを追跡品質で調停する。頭部・口形・指の所有範囲を変えない。 */
export function semanticTrackingWeight(
    layer: VrmPoseLayer,
    bone: VRMHumanBoneName,
    protection: number,
): number {
    return layer.kind === "semantic" && isSemanticArmOverrideBone(bone)
        ? layer.weight * (1 - protection)
        : layer.weight;
}

function isSemanticArmOverrideBone(bone: VRMHumanBoneName): boolean {
    return /^(left|right)(UpperArm|LowerArm|Hand)$/.test(bone);
}
