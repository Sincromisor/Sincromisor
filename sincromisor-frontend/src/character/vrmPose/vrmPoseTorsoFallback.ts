import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfile";
import { dampQuaternion } from "./vrmPoseQuaternionMath";
import type {
    VrmNormalizedLocalPose,
    VrmPoseLayer,
    VrmPoseLayerKind,
    VrmPoseQuaternion,
} from "./vrmPoseTypes";

export type TorsoDistribution = {
    spine: number;
    chest: number;
    upperChest: number;
};

export type TorsoDistributionResult = {
    distribution: TorsoDistribution;
    source: "profile" | "capability_default";
    warnings: string[];
};

export type TorsoFallbackLayerInput = {
    id: string;
    profile: AvatarMotionProfile;
    delta: VrmPoseQuaternion;
    weight: number;
    kind?: VrmPoseLayerKind;
};

const INVALID_TORSO_DISTRIBUTION_WARNING = "invalid_torso_distribution_profile_defaulted";
const DISTRIBUTION_SUM_EPSILON = 0.001;
const TORSO_BONES = ["spine", "chest", "upperChest"] as const;

type TorsoBoneName = (typeof TORSO_BONES)[number];

export function resolveTorsoDistribution(profile: AvatarMotionProfile): TorsoDistributionResult {
    if (isValidTorsoDistribution(profile.torso.distribution)) {
        return {
            distribution: { ...profile.torso.distribution },
            source: "profile",
            warnings: [],
        };
    }
    return {
        distribution: createCapabilityDefaultDistribution(profile),
        source: "capability_default",
        warnings: [INVALID_TORSO_DISTRIBUTION_WARNING],
    };
}

export function createTorsoFallbackLayer(input: TorsoFallbackLayerInput): VrmPoseLayer {
    const resolved = resolveTorsoDistribution(input.profile);
    const pose: VrmNormalizedLocalPose = {};
    const ownedBones: VRMHumanBoneName[] = [];

    for (const bone of TORSO_BONES) {
        if (!isAvailableTorsoBone(input.profile, bone)) {
            continue;
        }
        const distributionWeight = resolved.distribution[bone];
        if (distributionWeight <= 0) {
            continue;
        }
        pose[bone] = dampQuaternion(input.delta, distributionWeight);
        ownedBones.push(bone);
    }

    return {
        id: input.id,
        kind: input.kind ?? "fallback",
        blendMode: "additive",
        weight: finitePositiveWeight(input.weight),
        pose,
        ownedBones,
    };
}

function isValidTorsoDistribution(distribution: TorsoDistribution): boolean {
    if (
        !isFiniteNonNegative(distribution.spine) ||
        !isFiniteNonNegative(distribution.chest) ||
        !isFiniteNonNegative(distribution.upperChest)
    ) {
        return false;
    }
    const sum = distribution.spine + distribution.chest + distribution.upperChest;
    return Number.isFinite(sum) && Math.abs(sum - 1) <= DISTRIBUTION_SUM_EPSILON;
}

function createCapabilityDefaultDistribution(profile: AvatarMotionProfile): TorsoDistribution {
    const bones = profile.capabilities.bones;
    if (bones.spine === true && bones.chest === true && bones.upperChest === true) {
        return { spine: 0.25, chest: 0.4, upperChest: 0.35 };
    }
    if (bones.spine === true && bones.chest === true) {
        return { spine: 0.35, chest: 0.65, upperChest: 0 };
    }
    return { spine: 1, chest: 0, upperChest: 0 };
}

function isAvailableTorsoBone(profile: AvatarMotionProfile, bone: TorsoBoneName): boolean {
    return profile.capabilities.bones[bone] === true;
}

function isFiniteNonNegative(value: number): boolean {
    return Number.isFinite(value) && value >= 0;
}

function finitePositiveWeight(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}
