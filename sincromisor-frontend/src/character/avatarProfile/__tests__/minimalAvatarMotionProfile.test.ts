import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { describe, expect, it } from "vitest";

import { createMinimalAvatarMotionProfile } from "../minimalAvatarMotionProfile";

type TestVrmSource = Parameters<typeof createMinimalAvatarMotionProfile>[0];

type BonePosition = {
    name: VRMHumanBoneName;
    x: number;
    y: number;
    z: number;
};

const COMPLETE_BONE_POSITIONS: BonePosition[] = [
    { name: "neck", x: 0, y: 1.55, z: 0 },
    { name: "head", x: 0, y: 1.8, z: 0 },
    { name: "upperChest", x: 0, y: 1.35, z: 0 },
    { name: "leftShoulder", x: -0.28, y: 1.38, z: 0 },
    { name: "rightShoulder", x: 0.28, y: 1.38, z: 0 },
    { name: "leftUpperArm", x: -0.35, y: 1.32, z: 0 },
    { name: "leftLowerArm", x: -0.62, y: 1.1, z: 0 },
    { name: "leftHand", x: -0.86, y: 0.92, z: 0 },
    { name: "rightUpperArm", x: 0.35, y: 1.32, z: 0 },
    { name: "rightLowerArm", x: 0.62, y: 1.1, z: 0 },
    { name: "rightHand", x: 0.86, y: 0.92, z: 0 },
    { name: "leftThumbProximal", x: -0.88, y: 0.91, z: 0.03 },
    { name: "rightThumbProximal", x: 0.88, y: 0.91, z: 0.03 },
    { name: "leftIndexProximal", x: -0.91, y: 0.91, z: 0 },
    { name: "rightIndexProximal", x: 0.91, y: 0.91, z: 0 },
];

describe("createMinimalAvatarMotionProfile", () => {
    it("creates a plain v1 profile from a complete normalized skeleton", () => {
        const profile = createMinimalAvatarMotionProfile(createTestVrm(COMPLETE_BONE_POSITIONS));

        expect(profile.schemaVersion).toBe("sincro.minimal-avatar-motion-profile.v1");
        expect(profile.optionalBones).toEqual({
            upperChest: true,
            leftShoulder: true,
            rightShoulder: true,
            leftHand: true,
            rightHand: true,
            leftThumbProximal: true,
            rightThumbProximal: true,
            leftIndexProximal: true,
            rightIndexProximal: true,
        });
        expect(profile.measurements.shoulderWidth).toBeCloseTo(0.7, 6);
        expect(profile.measurements.leftUpperArmLength).toBeCloseTo(0.348, 3);
        expect(profile.measurements.leftLowerArmLength).toBeCloseTo(0.3, 6);
        expect(profile.measurements.rightUpperArmLength).toBeCloseTo(0.348, 3);
        expect(profile.measurements.rightLowerArmLength).toBeCloseTo(0.3, 6);
        expect(profile.measurements.headSize).toBeCloseTo(0.25, 6);
        expect(profile.solverDefaults).toEqual({
            defaultReachScale: 1,
            depthCompression: 0.55,
            lateralScale: 1,
            verticalScale: 0.92,
            shoulderDamping: 0.65,
            wristRollInfluence: 0.25,
        });
        expect(profile.warnings).toEqual([]);
        expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
    });

    it("keeps upperChest optional and estimates head size from shoulder width", () => {
        const profile = createMinimalAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "upperChest", "neck")),
        );

        expect(profile.optionalBones.upperChest).toBe(false);
        expect(profile.measurements.headSize).toBeCloseTo(0.525, 6);
        expect(profile.warnings).toEqual([
            "missing_upper_chest",
            "head_size_estimated_from_shoulder_width",
        ]);
    });

    it("marks only the missing finger capability false", () => {
        const profile = createMinimalAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "leftIndexProximal")),
        );

        expect(profile.optionalBones.leftIndexProximal).toBe(false);
        expect(profile.optionalBones.rightIndexProximal).toBe(true);
        expect(profile.optionalBones.leftThumbProximal).toBe(true);
        expect(profile.warnings).toEqual(["missing_left_index_proximal"]);
    });

    it("uses undefined and warnings when arm length cannot be measured", () => {
        const profile = createMinimalAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "leftLowerArm")),
        );

        expect(profile.optionalBones.leftHand).toBe(true);
        expect(profile.measurements.leftUpperArmLength).toBeUndefined();
        expect(profile.measurements.leftLowerArmLength).toBeUndefined();
        expect(profile.measurements.rightUpperArmLength).toBeCloseTo(0.348, 3);
        expect(profile.measurements.rightLowerArmLength).toBeCloseTo(0.3, 6);
        expect(profile.warnings).toEqual([
            "left_upper_arm_length_unmeasured",
            "left_lower_arm_length_unmeasured",
        ]);
    });
});

function createTestVrm(positions: BonePosition[]): TestVrmSource {
    const scene = new Object3D();
    const nodes = new Map<VRMHumanBoneName, Object3D>();
    for (const position of positions) {
        const node = new Object3D();
        node.position.set(position.x, position.y, position.z);
        scene.add(node);
        nodes.set(position.name, node);
    }
    return {
        scene,
        humanoid: {
            getNormalizedBoneNode(name: VRMHumanBoneName): Object3D | null {
                return nodes.get(name) ?? null;
            },
        },
    };
}

function withoutBones(positions: BonePosition[], ...names: VRMHumanBoneName[]): BonePosition[] {
    return positions.filter((position) => !names.includes(position.name));
}
