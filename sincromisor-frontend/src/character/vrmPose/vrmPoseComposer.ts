import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { MathUtils } from "three/src/math/MathUtils.js";
import type { Quaternion } from "three/src/math/Quaternion.js";
import type { AvatarOptionalBoneCapabilities } from "../avatarProfile/minimalAvatarMotionProfile";
import {
    armSide,
    isAvailableBone,
    isSupportedOwnedBone,
    missingShoulderFallbackBone,
} from "./vrmPoseBonePolicy";
import {
    additiveQuaternion,
    angularVelocityLimit,
    dampQuaternion,
    deserializeQuaternion,
    NORMALIZATION_EPSILON,
    overrideQuaternion,
    serializeQuaternion,
} from "./vrmPoseQuaternionMath";
import type {
    VrmPoseComposerInput,
    VrmPoseComposerResult,
    VrmPoseLayer,
    VrmPoseLayerKind,
    VrmPoseQuaternion,
} from "./vrmPoseTypes";

const LAYER_ORDER: VrmPoseLayerKind[] = ["fallback", "tracking", "idle", "style"];

type PoseWrite = {
    bone: VRMHumanBoneName;
    sourceBone: VRMHumanBoneName;
    quaternion: VrmPoseQuaternion;
};

type TrackingOwnership = {
    left: Set<VRMHumanBoneName>;
    right: Set<VRMHumanBoneName>;
};

export function composeVrmPose(input: VrmPoseComposerInput): VrmPoseComposerResult {
    const result: VrmPoseComposerResult = {
        finalPose: {},
        ownedBones: [],
        suppressedLayers: [],
        clampedBones: [],
        warnings: [],
    };
    const finalQuaternions = new Map<VRMHumanBoneName, Quaternion>();
    const trackingOwnership = createTrackingOwnership(input.layers, input.profile.optionalBones);

    for (const kind of LAYER_ORDER) {
        for (const layer of input.layers) {
            if (layer.kind !== kind) {
                continue;
            }
            applyLayer(layer, input, trackingOwnership, finalQuaternions, result);
        }
    }

    finalizePose(finalQuaternions, input, result);
    return result;
}

function applyLayer(
    layer: VrmPoseLayer,
    input: VrmPoseComposerInput,
    trackingOwnership: TrackingOwnership,
    finalQuaternions: Map<VRMHumanBoneName, Quaternion>,
    result: VrmPoseComposerResult,
): void {
    const writes = createPoseWrites(
        layer,
        input.profile.optionalBones,
        input.profile.solverDefaults.shoulderDamping,
        result,
    );
    for (const write of writes) {
        if (shouldSuppressZeroWeight(layer.weight)) {
            addSuppressedLayer(result, layer, write.sourceBone, "zero_weight");
            continue;
        }
        if (shouldSuppressTrackingOwnedBone(layer, write.bone, trackingOwnership)) {
            addSuppressedLayer(result, layer, write.sourceBone, "tracking_owns_bone");
            continue;
        }
        if (hasOwnedBoneConflict(layer, write.bone, result.ownedBones)) {
            addWarning(result, `owned_bone_conflict:${write.bone}`);
        }
        const current = finalQuaternions.get(write.bone);
        const next =
            layer.blendMode === "override"
                ? overrideQuaternion(current, write.quaternion, layer.weight)
                : additiveQuaternion(current, write.quaternion, layer.weight);
        finalQuaternions.set(write.bone, next);
        addOwnedBone(result, write.bone);
    }
}

function createPoseWrites(
    layer: VrmPoseLayer,
    optionalBones: AvatarOptionalBoneCapabilities,
    shoulderDamping: number,
    result: VrmPoseComposerResult,
): PoseWrite[] {
    const writes: PoseWrite[] = [];
    for (const bone of layer.ownedBones) {
        const poseQuaternion = layer.pose[bone];
        if (!poseQuaternion) {
            continue;
        }
        const fallbackBone = missingShoulderFallbackBone(bone, optionalBones);
        if (fallbackBone) {
            addSuppressedLayer(result, layer, bone, "missing_optional_bone");
            writes.push({
                bone: fallbackBone,
                sourceBone: bone,
                quaternion: dampQuaternion(poseQuaternion, shoulderDamping),
            });
            continue;
        }
        if (!isSupportedOwnedBone(bone)) {
            addWarning(result, `unsupported_bone:${bone}`);
            continue;
        }
        if (!isAvailableBone(bone, optionalBones)) {
            addSuppressedLayer(result, layer, bone, "missing_optional_bone");
            continue;
        }
        writes.push({ bone, sourceBone: bone, quaternion: poseQuaternion });
    }
    return writes;
}

function finalizePose(
    finalQuaternions: Map<VRMHumanBoneName, Quaternion>,
    input: VrmPoseComposerInput,
    result: VrmPoseComposerResult,
): void {
    const shouldClampAngular =
        input.previousFinalPose !== undefined &&
        input.deltaSeconds !== undefined &&
        input.deltaSeconds > 0;
    const limitDegPerSec = angularVelocityLimit(input.angularVelocityLimitDegPerSec);
    const maxAngleRad = MathUtils.degToRad(limitDegPerSec) * (input.deltaSeconds ?? 0);

    for (const bone of result.ownedBones) {
        const quaternion = finalQuaternions.get(bone);
        if (!quaternion) {
            continue;
        }
        const normalized = quaternion.clone().normalize();
        if (Math.abs(quaternion.length() - 1) > NORMALIZATION_EPSILON) {
            result.clampedBones.push({
                bone,
                reason: "quaternion_normalized",
                before: serializeQuaternion(quaternion),
                after: serializeQuaternion(normalized),
            });
        }
        const previous = input.previousFinalPose?.[bone];
        const finalQuaternion =
            shouldClampAngular && previous
                ? clampAngularVelocity(bone, normalized, previous, maxAngleRad, result)
                : normalized;
        result.finalPose[bone] = serializeQuaternion(finalQuaternion);
    }
}

function clampAngularVelocity(
    bone: VRMHumanBoneName,
    quaternion: Quaternion,
    previous: VrmPoseQuaternion,
    maxAngleRad: number,
    result: VrmPoseComposerResult,
): Quaternion {
    const previousQuaternion = deserializeQuaternion(previous).normalize();
    const angle = previousQuaternion.angleTo(quaternion);
    if (angle <= maxAngleRad) {
        return quaternion;
    }
    const clamped = previousQuaternion
        .clone()
        .slerp(quaternion, maxAngleRad / angle)
        .normalize();
    result.clampedBones.push({
        bone,
        reason: "angular_velocity",
        before: serializeQuaternion(quaternion),
        after: serializeQuaternion(clamped),
    });
    return clamped;
}

function createTrackingOwnership(
    layers: VrmPoseLayer[],
    optionalBones: AvatarOptionalBoneCapabilities,
): TrackingOwnership {
    const ownership: TrackingOwnership = { left: new Set(), right: new Set() };
    for (const layer of layers) {
        if (layer.kind !== "tracking" || shouldSuppressZeroWeight(layer.weight)) {
            continue;
        }
        for (const write of createTrackingWrites(layer, optionalBones)) {
            const side = armSide(write.bone);
            if (side) {
                ownership[side].add(write.bone);
            }
        }
    }
    return ownership;
}

function createTrackingWrites(
    layer: VrmPoseLayer,
    optionalBones: AvatarOptionalBoneCapabilities,
): PoseWrite[] {
    const writes: PoseWrite[] = [];
    for (const bone of layer.ownedBones) {
        if (!layer.pose[bone]) {
            continue;
        }
        const fallbackBone = missingShoulderFallbackBone(bone, optionalBones);
        if (fallbackBone) {
            writes.push({ bone: fallbackBone, sourceBone: bone, quaternion: layer.pose[bone] });
            continue;
        }
        if (isSupportedOwnedBone(bone) && isAvailableBone(bone, optionalBones)) {
            writes.push({ bone, sourceBone: bone, quaternion: layer.pose[bone] });
        }
    }
    return writes;
}

function shouldSuppressTrackingOwnedBone(
    layer: VrmPoseLayer,
    bone: VRMHumanBoneName,
    trackingOwnership: TrackingOwnership,
): boolean {
    if (layer.kind !== "idle" && layer.kind !== "style") {
        return false;
    }
    const side = armSide(bone);
    if (!side) {
        return false;
    }
    return trackingOwnership[side].has(bone);
}

function hasOwnedBoneConflict(
    layer: VrmPoseLayer,
    bone: VRMHumanBoneName,
    ownedBones: VRMHumanBoneName[],
): boolean {
    return layer.kind !== "tracking" && ownedBones.includes(bone);
}

function shouldSuppressZeroWeight(weight: number): boolean {
    return !Number.isFinite(weight) || weight <= 0;
}

function addOwnedBone(result: VrmPoseComposerResult, bone: VRMHumanBoneName): void {
    if (!result.ownedBones.includes(bone)) {
        result.ownedBones.push(bone);
    }
}

function addSuppressedLayer(
    result: VrmPoseComposerResult,
    layer: VrmPoseLayer,
    bone: VRMHumanBoneName,
    reason: VrmPoseComposerResult["suppressedLayers"][number]["reason"],
): void {
    result.suppressedLayers.push({ id: layer.id, kind: layer.kind, bone, reason });
}

function addWarning(result: VrmPoseComposerResult, warning: string): void {
    if (!result.warnings.includes(warning)) {
        result.warnings.push(warning);
    }
}
