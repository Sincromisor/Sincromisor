import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import type { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";

export type AvatarOptionalBoneCapabilities = {
    upperChest: boolean;
    leftShoulder: boolean;
    rightShoulder: boolean;
    leftHand: boolean;
    rightHand: boolean;
    leftThumbProximal: boolean;
    rightThumbProximal: boolean;
    leftIndexProximal: boolean;
    rightIndexProximal: boolean;
};

export type MinimalAvatarMotionProfile = {
    schemaVersion: "sincro.minimal-avatar-motion-profile.v1";
    optionalBones: AvatarOptionalBoneCapabilities;
    measurements: {
        shoulderWidth?: number;
        leftUpperArmLength?: number;
        leftLowerArmLength?: number;
        rightUpperArmLength?: number;
        rightLowerArmLength?: number;
        headSize?: number;
    };
    solverDefaults: {
        defaultReachScale: number;
        depthCompression: number;
        lateralScale: number;
        verticalScale: number;
        shoulderDamping: number;
        wristRollInfluence: number;
    };
    warnings: string[];
};

type MinimalAvatarMotionProfileVrmSource = {
    scene: Object3D;
    humanoid: {
        getNormalizedBoneNode(name: VRMHumanBoneName): Object3D | null;
    };
};

type BoneCapabilitySpec = {
    key: keyof AvatarOptionalBoneCapabilities;
    boneName: VRMHumanBoneName;
    missingWarning: string;
};

const SCHEMA_VERSION = "sincro.minimal-avatar-motion-profile.v1" as const;

const OPTIONAL_BONE_SPECS: BoneCapabilitySpec[] = [
    { key: "upperChest", boneName: "upperChest", missingWarning: "missing_upper_chest" },
    { key: "leftShoulder", boneName: "leftShoulder", missingWarning: "missing_left_shoulder" },
    { key: "rightShoulder", boneName: "rightShoulder", missingWarning: "missing_right_shoulder" },
    { key: "leftHand", boneName: "leftHand", missingWarning: "missing_left_hand" },
    { key: "rightHand", boneName: "rightHand", missingWarning: "missing_right_hand" },
    {
        key: "leftThumbProximal",
        boneName: "leftThumbProximal",
        missingWarning: "missing_left_thumb_proximal",
    },
    {
        key: "rightThumbProximal",
        boneName: "rightThumbProximal",
        missingWarning: "missing_right_thumb_proximal",
    },
    {
        key: "leftIndexProximal",
        boneName: "leftIndexProximal",
        missingWarning: "missing_left_index_proximal",
    },
    {
        key: "rightIndexProximal",
        boneName: "rightIndexProximal",
        missingWarning: "missing_right_index_proximal",
    },
];

const SOLVER_DEFAULTS: MinimalAvatarMotionProfile["solverDefaults"] = {
    defaultReachScale: 1,
    depthCompression: 0.55,
    lateralScale: 1,
    verticalScale: 0.92,
    shoulderDamping: 0.65,
    wristRollInfluence: 0.25,
};

export function createMinimalAvatarMotionProfile(
    vrm: MinimalAvatarMotionProfileVrmSource,
): MinimalAvatarMotionProfile {
    vrm.scene.updateMatrixWorld(true);
    const warnings = new Set<string>();
    const optionalBones = createOptionalBoneCapabilities(vrm, warnings);
    const measurements = createMeasurements(vrm, warnings);
    return {
        schemaVersion: SCHEMA_VERSION,
        optionalBones,
        measurements,
        solverDefaults: { ...SOLVER_DEFAULTS },
        warnings: [...warnings],
    };
}

export function cloneMinimalAvatarMotionProfile(
    profile: MinimalAvatarMotionProfile,
): MinimalAvatarMotionProfile {
    return {
        schemaVersion: profile.schemaVersion,
        optionalBones: { ...profile.optionalBones },
        measurements: { ...profile.measurements },
        solverDefaults: { ...profile.solverDefaults },
        warnings: [...profile.warnings],
    };
}

function createOptionalBoneCapabilities(
    vrm: MinimalAvatarMotionProfileVrmSource,
    warnings: Set<string>,
): AvatarOptionalBoneCapabilities {
    const capabilities: AvatarOptionalBoneCapabilities = {
        upperChest: false,
        leftShoulder: false,
        rightShoulder: false,
        leftHand: false,
        rightHand: false,
        leftThumbProximal: false,
        rightThumbProximal: false,
        leftIndexProximal: false,
        rightIndexProximal: false,
    };
    for (const spec of OPTIONAL_BONE_SPECS) {
        const hasBone = getBoneNode(vrm, spec.boneName) !== undefined;
        capabilities[spec.key] = hasBone;
        if (!hasBone) {
            warnings.add(spec.missingWarning);
        }
    }
    return capabilities;
}

function createMeasurements(
    vrm: MinimalAvatarMotionProfileVrmSource,
    warnings: Set<string>,
): MinimalAvatarMotionProfile["measurements"] {
    const shoulderWidth = measureDistance(vrm, "leftUpperArm", "rightUpperArm", 0.08);
    const leftUpperArmLength = measureDistance(vrm, "leftUpperArm", "leftLowerArm", 0.04);
    const leftLowerArmLength = measureDistance(vrm, "leftLowerArm", "leftHand", 0.04);
    const rightUpperArmLength = measureDistance(vrm, "rightUpperArm", "rightLowerArm", 0.04);
    const rightLowerArmLength = measureDistance(vrm, "rightLowerArm", "rightHand", 0.04);
    addUnmeasuredWarning(warnings, shoulderWidth, "shoulder_width_unmeasured");
    addUnmeasuredWarning(warnings, leftUpperArmLength, "left_upper_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, leftLowerArmLength, "left_lower_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, rightUpperArmLength, "right_upper_arm_length_unmeasured");
    addUnmeasuredWarning(warnings, rightLowerArmLength, "right_lower_arm_length_unmeasured");
    const headSize = measureHeadSize(vrm, shoulderWidth, warnings);
    return {
        shoulderWidth,
        leftUpperArmLength,
        leftLowerArmLength,
        rightUpperArmLength,
        rightLowerArmLength,
        headSize,
    };
}

function measureHeadSize(
    vrm: MinimalAvatarMotionProfileVrmSource,
    shoulderWidth: number | undefined,
    warnings: Set<string>,
): number | undefined {
    const measured = measureDistance(vrm, "neck", "head");
    if (measured !== undefined) {
        return measured;
    }
    if (shoulderWidth !== undefined) {
        warnings.add("head_size_estimated_from_shoulder_width");
        return finiteNumberOrUndefined(shoulderWidth * 0.75);
    }
    warnings.add("head_size_unmeasured");
    return undefined;
}

function measureDistance(
    vrm: MinimalAvatarMotionProfileVrmSource,
    fromName: VRMHumanBoneName,
    toName: VRMHumanBoneName,
    minValue?: number,
): number | undefined {
    const from = getBoneNode(vrm, fromName);
    const to = getBoneNode(vrm, toName);
    if (!from || !to) {
        return undefined;
    }
    const distance = worldPosition(from).distanceTo(worldPosition(to));
    const value = minValue === undefined ? distance : Math.max(distance, minValue);
    return finiteNumberOrUndefined(value);
}

function getBoneNode(
    vrm: MinimalAvatarMotionProfileVrmSource,
    name: VRMHumanBoneName,
): Object3D | undefined {
    return vrm.humanoid.getNormalizedBoneNode(name) ?? undefined;
}

function worldPosition(node: Object3D): Vector3 {
    return node.getWorldPosition(new Vector3());
}

function finiteNumberOrUndefined(value: number): number | undefined {
    return Number.isFinite(value) ? value : undefined;
}

function addUnmeasuredWarning(
    warnings: Set<string>,
    value: number | undefined,
    warning: string,
): void {
    if (value === undefined) {
        warnings.add(warning);
    }
}
