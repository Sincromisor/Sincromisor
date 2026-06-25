import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";

export type VrmPoseQuaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
};

export type VrmNormalizedLocalPose = Partial<Record<VRMHumanBoneName, VrmPoseQuaternion>>;

export type VrmPoseLayerKind = "fallback" | "tracking" | "idle" | "style";

export type VrmPoseBlendMode = "override" | "additive";

export type VrmPoseLayer = {
    id: string;
    kind: VrmPoseLayerKind;
    blendMode: VrmPoseBlendMode;
    weight: number;
    pose: VrmNormalizedLocalPose;
    ownedBones: VRMHumanBoneName[];
};

export type VrmPoseComposerInput = {
    layers: VrmPoseLayer[];
    profile: MinimalAvatarMotionProfile;
    previousFinalPose?: VrmNormalizedLocalPose;
    deltaSeconds?: number;
    angularVelocityLimitDegPerSec?: number;
};

export type VrmPoseComposerResult = {
    finalPose: VrmNormalizedLocalPose;
    ownedBones: VRMHumanBoneName[];
    suppressedLayers: Array<{
        id: string;
        kind: VrmPoseLayerKind;
        bone: VRMHumanBoneName;
        reason: "tracking_owns_bone" | "missing_optional_bone" | "zero_weight";
    }>;
    clampedBones: Array<{
        bone: VRMHumanBoneName;
        reason: "quaternion_normalized" | "angular_velocity";
        before?: VrmPoseQuaternion;
        after: VrmPoseQuaternion;
    }>;
    warnings: string[];
};
