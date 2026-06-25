import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { describe, expect, it } from "vitest";
import {
    AVATAR_MOTION_PROFILE_SCHEMA_VERSION,
    cloneAvatarMotionProfile,
    createAvatarMotionProfile,
    parseAvatarMotionProfile,
    toMinimalAvatarMotionProfile,
} from "../avatarMotionProfile";

type TestVrmSource = Parameters<typeof createAvatarMotionProfile>[0];

type BonePosition = {
    name: VRMHumanBoneName;
    x: number;
    y: number;
    z: number;
};

const COMPLETE_BONE_POSITIONS: BonePosition[] = [
    { name: "hips", x: 0, y: 0.9, z: 0 },
    { name: "spine", x: 0, y: 1.1, z: 0 },
    { name: "chest", x: 0, y: 1.35, z: 0 },
    { name: "upperChest", x: 0, y: 1.48, z: 0 },
    { name: "neck", x: 0, y: 1.6, z: 0 },
    { name: "head", x: 0, y: 1.82, z: 0 },
    { name: "leftShoulder", x: -0.25, y: 1.45, z: 0 },
    { name: "leftUpperArm", x: -0.35, y: 1.36, z: 0 },
    { name: "leftLowerArm", x: -0.62, y: 1.16, z: 0 },
    { name: "leftHand", x: -0.86, y: 0.98, z: 0 },
    { name: "rightShoulder", x: 0.25, y: 1.45, z: 0 },
    { name: "rightUpperArm", x: 0.35, y: 1.36, z: 0 },
    { name: "rightLowerArm", x: 0.62, y: 1.16, z: 0 },
    { name: "rightHand", x: 0.86, y: 0.98, z: 0 },
    { name: "leftThumbMetacarpal", x: -0.87, y: 0.98, z: 0.02 },
    { name: "leftThumbProximal", x: -0.89, y: 0.96, z: 0.03 },
    { name: "leftThumbDistal", x: -0.91, y: 0.94, z: 0.04 },
    { name: "leftIndexProximal", x: -0.9, y: 0.96, z: 0 },
    { name: "leftIndexIntermediate", x: -0.93, y: 0.94, z: 0 },
    { name: "leftIndexDistal", x: -0.96, y: 0.92, z: 0 },
    { name: "leftMiddleProximal", x: -0.89, y: 0.955, z: -0.01 },
    { name: "leftMiddleIntermediate", x: -0.93, y: 0.93, z: -0.01 },
    { name: "leftMiddleDistal", x: -0.97, y: 0.905, z: -0.01 },
    { name: "leftRingProximal", x: -0.885, y: 0.95, z: -0.02 },
    { name: "leftRingIntermediate", x: -0.92, y: 0.925, z: -0.02 },
    { name: "leftRingDistal", x: -0.955, y: 0.9, z: -0.02 },
    { name: "leftLittleProximal", x: -0.88, y: 0.945, z: -0.03 },
    { name: "leftLittleIntermediate", x: -0.91, y: 0.92, z: -0.03 },
    { name: "leftLittleDistal", x: -0.94, y: 0.895, z: -0.03 },
    { name: "rightThumbMetacarpal", x: 0.87, y: 0.98, z: 0.02 },
    { name: "rightThumbProximal", x: 0.89, y: 0.96, z: 0.03 },
    { name: "rightThumbDistal", x: 0.91, y: 0.94, z: 0.04 },
    { name: "rightIndexProximal", x: 0.9, y: 0.96, z: 0 },
    { name: "rightIndexIntermediate", x: 0.93, y: 0.94, z: 0 },
    { name: "rightIndexDistal", x: 0.96, y: 0.92, z: 0 },
    { name: "rightMiddleProximal", x: 0.89, y: 0.955, z: -0.01 },
    { name: "rightMiddleIntermediate", x: 0.93, y: 0.93, z: -0.01 },
    { name: "rightMiddleDistal", x: 0.97, y: 0.905, z: -0.01 },
    { name: "rightRingProximal", x: 0.885, y: 0.95, z: -0.02 },
    { name: "rightRingIntermediate", x: 0.92, y: 0.925, z: -0.02 },
    { name: "rightRingDistal", x: 0.955, y: 0.9, z: -0.02 },
    { name: "rightLittleProximal", x: 0.88, y: 0.945, z: -0.03 },
    { name: "rightLittleIntermediate", x: 0.91, y: 0.92, z: -0.03 },
    { name: "rightLittleDistal", x: 0.94, y: 0.895, z: -0.03 },
];

describe("AvatarMotionProfile", () => {
    it("creates a plain v1 profile from a complete normalized skeleton", () => {
        const profile = createAvatarMotionProfile(createTestVrm(COMPLETE_BONE_POSITIONS));

        expect(profile.schemaVersion).toBe(AVATAR_MOTION_PROFILE_SCHEMA_VERSION);
        expect(profile.model).toEqual({ vrmVersion: "1.0", modelName: "Test Avatar" });
        expect(profile.capabilities.bones.upperChest).toBe(true);
        expect(profile.capabilities.fingerChains.left.index).toEqual({
            proximal: true,
            intermediate: true,
            distal: true,
        });
        expect(profile.restLocalRotation.leftUpperArm).toEqual([0, 0, 0, 1]);
        expect(profile.metrics.shoulderWidth).toBeCloseTo(0.7, 6);
        expect(profile.metrics.torsoLength).toBeCloseTo(0.25, 6);
        expect(profile.metrics.headSize).toBeCloseTo(0.22, 6);
        expect(profile.metrics.upperArmLength.left).toBeCloseTo(0.336, 3);
        expect(profile.metrics.lowerArmLength.right).toBeCloseTo(0.3, 6);
        expect(profile.metrics.handSize.left).toBeCloseTo(0.045, 3);
        expect(profile.torso.distribution).toEqual({ spine: 0.25, chest: 0.4, upperChest: 0.35 });
        expect(profile.arm).toMatchObject({
            reachScale: 0.92,
            depthCompression: 0.6,
            shoulderDamping: 0.55,
        });
        expect(profile.wrist.wristRollInfluence).toBe(0.4);
        expect(profile.fingers.curlMode).toBe("grouped");
        expect(profile.warnings).toEqual([]);
        expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
        expect(parseAvatarMotionProfile(profile)).toMatchObject({ ok: true });
    });

    it("keeps upperChest optional and switches torso distribution", () => {
        const profile = createAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "upperChest")),
        );

        expect(profile.capabilities.bones.upperChest).toBe(false);
        expect(profile.torso.distribution).toEqual({ spine: 0.35, chest: 0.65, upperChest: 0 });
        expect(profile.risk.missingUpperChest).toBe(true);
        expect(profile.warnings).toContain("missing_upperChest");
    });

    it("marks missing shoulders without throwing", () => {
        const profile = createAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "leftShoulder", "rightShoulder")),
        );

        expect(profile.capabilities.bones.leftShoulder).toBe(false);
        expect(profile.capabilities.bones.rightShoulder).toBe(false);
        expect(profile.risk.missingShoulders).toBe(true);
        expect(profile.warnings).toEqual(
            expect.arrayContaining(["missing_leftShoulder", "missing_rightShoulder"]),
        );
    });

    it("marks finger chain gaps per side and finger", () => {
        const profile = createAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "leftIndexIntermediate")),
        );

        expect(profile.capabilities.fingerChains.left.index).toEqual({
            proximal: true,
            intermediate: false,
            distal: true,
        });
        expect(profile.capabilities.fingerChains.right.index.intermediate).toBe(true);
        expect(profile.warnings).toEqual(["missing_leftIndexIntermediate"]);
    });

    it("drops non finite measurements and local rotations", () => {
        const vrm = createTestVrm(COMPLETE_BONE_POSITIONS, (nodes) => {
            nodes.get("leftUpperArm")?.position.set(Number.NaN, 1.36, 0);
            const rightHand = nodes.get("rightHand");
            if (rightHand) {
                rightHand.quaternion.x = Number.POSITIVE_INFINITY;
            }
        });
        const profile = createAvatarMotionProfile(vrm);

        expect(profile.metrics.shoulderWidth).toBeUndefined();
        expect(profile.metrics.upperArmLength.left).toBeUndefined();
        expect(profile.restLocalRotation.rightHand).toBeUndefined();
        expect(profile.warnings).toEqual(
            expect.arrayContaining([
                "shoulder_width_unmeasured",
                "left_upper_arm_length_unmeasured",
                "invalid_rest_rotation:rightHand",
            ]),
        );
        expectErrorCode(
            parseAvatarMotionProfile({
                ...profile,
                metrics: { ...profile.metrics, shoulderWidth: Number.POSITIVE_INFINITY },
            }),
            "out_of_range",
            ["metrics", "shoulderWidth"],
        );
    });

    it("rejects unknown schema versions, unknown enums, and extra keys", () => {
        const profile = createAvatarMotionProfile(createTestVrm(COMPLETE_BONE_POSITIONS));

        expectErrorCode(
            parseAvatarMotionProfile({
                ...profile,
                schemaVersion: "sincro.avatar-motion-profile.v2",
            }),
            "unknown_schema_version",
            ["schemaVersion"],
        );
        expectErrorCode(
            parseAvatarMotionProfile({
                ...profile,
                fingers: { ...profile.fingers, curlMode: "individual" },
            }),
            "invalid_state",
            ["fingers", "curlMode"],
        );
        expectErrorCode(parseAvatarMotionProfile({ ...profile, extra: true }), "invalid_state", []);
    });

    it("deep clones nested profile state", () => {
        const profile = createAvatarMotionProfile(createTestVrm(COMPLETE_BONE_POSITIONS));
        const cloned = cloneAvatarMotionProfile(profile);

        cloned.metrics.upperArmLength.left = 9;
        cloned.restLocalRotation.leftUpperArm = [1, 0, 0, 0];
        cloned.warnings.push("mutated");

        expect(profile.metrics.upperArmLength.left).not.toBe(9);
        expect(profile.restLocalRotation.leftUpperArm).toEqual([0, 0, 0, 1]);
        expect(profile.warnings).toEqual([]);
    });

    it("converts to the Phase 6 minimal profile shape from v1 defaults", () => {
        const profile = createAvatarMotionProfile(
            createTestVrm(withoutBones(COMPLETE_BONE_POSITIONS, "upperChest", "leftThumbProximal")),
        );
        const minimal = toMinimalAvatarMotionProfile(profile);

        expect(minimal).toMatchObject({
            schemaVersion: "sincro.minimal-avatar-motion-profile.v1",
            optionalBones: {
                upperChest: false,
                leftShoulder: true,
                rightShoulder: true,
                leftHand: true,
                rightHand: true,
                leftThumbProximal: false,
                rightThumbProximal: true,
                leftIndexProximal: true,
                rightIndexProximal: true,
            },
            solverDefaults: {
                defaultReachScale: 0.92,
                depthCompression: 0.6,
                lateralScale: 0.9,
                verticalScale: 0.95,
                shoulderDamping: 0.55,
                wristRollInfluence: 0.4,
            },
        });
        expect(minimal.measurements.leftUpperArmLength).toBe(profile.metrics.upperArmLength.left);
        expect(minimal.warnings).toEqual(profile.warnings);
    });
});

function createTestVrm(
    positions: BonePosition[],
    mutateNodes?: (nodes: Map<VRMHumanBoneName, Object3D>) => void,
): TestVrmSource {
    const scene = new Object3D();
    const nodes = new Map<VRMHumanBoneName, Object3D>();
    for (const position of positions) {
        const node = new Object3D();
        node.position.set(position.x, position.y, position.z);
        scene.add(node);
        nodes.set(position.name, node);
    }
    mutateNodes?.(nodes);
    return {
        scene,
        meta: {
            metaVersion: "1",
            name: "Test Avatar",
        },
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

function expectErrorCode(
    result: ReturnType<typeof parseAvatarMotionProfile>,
    code: "unknown_schema_version" | "invalid_state" | "out_of_range",
    path?: string[],
): void {
    expect(result.ok).toBe(false);
    if (result.ok) {
        return;
    }
    expect(result.errors).toEqual(
        expect.arrayContaining([
            expect.objectContaining({
                code,
                ...(path ? { path } : {}),
            }),
        ]),
    );
}
