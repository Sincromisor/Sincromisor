import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { CCDIKSolver, type IK } from "three/examples/jsm/animation/CCDIKSolver.js";
import type { Object3D } from "three/src/core/Object3D.js";
import { MathUtils } from "three/src/math/MathUtils.js";
import { Matrix4 } from "three/src/math/Matrix4.js";
import type { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { Bone } from "three/src/objects/Bone.js";
import { SkinnedMesh } from "three/src/objects/SkinnedMesh.js";

export type SincroCcdIkProbeStatus = "ready" | "unsupported" | "failed";

export type SincroCcdIkProbeResult = {
    side: "left" | "right";
    status: SincroCcdIkProbeStatus;
    reason: string;
    skinnedMeshCount: number;
    normalizedChainInSkeleton: boolean;
    rawChainInSkeleton: boolean;
    targetBoneRequired: boolean;
    notes: string[];
};

type ArmChain = {
    upperArm?: Object3D;
    lowerArm?: Object3D;
    hand?: Object3D;
};

type CcdIkChain = {
    mesh: SkinnedMesh;
    upperIndex: number;
    lowerIndex: number;
    handIndex: number;
    upperBone: Bone;
    lowerBone: Bone;
    handBone: Bone;
};

const ARM_BONE_NAMES: Record<
    "left" | "right",
    {
        upperArm: VRMHumanBoneName;
        lowerArm: VRMHumanBoneName;
        hand: VRMHumanBoneName;
    }
> = {
    left: {
        upperArm: "leftUpperArm",
        lowerArm: "leftLowerArm",
        hand: "leftHand",
    },
    right: {
        upperArm: "rightUpperArm",
        lowerArm: "rightLowerArm",
        hand: "rightHand",
    },
};

// CCDIKSolver は SkinnedMesh.skeleton.bones の index を前提にするため、VRM normalized
// bone ではなく raw bone chain へ到達できるかだけをロード時に検査する。
export function runSincroCcdIkProbe(
    vrm: VRM,
    side: "left" | "right" = "left",
): SincroCcdIkProbeResult {
    vrm.scene.updateMatrixWorld(true);
    const skinnedMeshes = collectSkinnedMeshes(vrm.scene);
    const normalizedChain = armChain(vrm, side, "normalized");
    const rawChain = armChain(vrm, side, "raw");
    const normalizedChainInSkeleton = chainInAnySkeleton(skinnedMeshes, normalizedChain);
    const rawChainInSkeleton = chainInAnySkeleton(skinnedMeshes, rawChain);
    const chain = findCcdIkChain(skinnedMeshes, rawChain);
    const baseResult = {
        side,
        skinnedMeshCount: skinnedMeshes.length,
        normalizedChainInSkeleton,
        rawChainInSkeleton,
        targetBoneRequired: true,
    };

    if (!chain) {
        return {
            ...baseResult,
            status: "unsupported",
            reason: "raw_chain_not_found_in_skinned_mesh",
            notes: [
                "CCDIKSolver cannot consume three-vrm normalized bones directly.",
                "A production path would need raw-bone solving plus a normalized/raw pose bridge.",
            ],
        };
    }

    const solveError = smokeTestCcdIk(chain);
    if (solveError) {
        return {
            ...baseResult,
            status: "failed",
            reason: solveError,
            notes: [
                "A raw skeleton chain was found, but CCDIKSolver did not complete a one-iteration smoke test.",
                "The current normalized two-bone solver remains the safer runtime path.",
            ],
        };
    }

    return {
        ...baseResult,
        status: "ready",
        reason: "raw_chain_solver_smoke_test_passed",
        notes: [
            normalizedChainInSkeleton
                ? "This VRM exposes normalized bones inside a SkinnedMesh skeleton."
                : "Normalized bones are separate from SkinnedMesh skeleton bones.",
            "CCDIKSolver can run on the raw arm chain, but it needs a temporary target bone index.",
            "The result would still need retargeting back into the normalized bone workflow.",
        ],
    };
}

function armChain(vrm: VRM, side: "left" | "right", space: "raw" | "normalized"): ArmChain {
    const names = ARM_BONE_NAMES[side];
    return {
        upperArm: getHumanoidBone(vrm, names.upperArm, space),
        lowerArm: getHumanoidBone(vrm, names.lowerArm, space),
        hand: getHumanoidBone(vrm, names.hand, space),
    };
}

function getHumanoidBone(
    vrm: VRM,
    name: VRMHumanBoneName,
    space: "raw" | "normalized",
): Object3D | undefined {
    const bone =
        space === "raw"
            ? vrm.humanoid.getRawBoneNode(name)
            : vrm.humanoid.getNormalizedBoneNode(name);
    return bone ?? undefined;
}

function collectSkinnedMeshes(root: Object3D): SkinnedMesh[] {
    const skinnedMeshes: SkinnedMesh[] = [];
    root.traverse((object) => {
        if (isSkinnedMeshObject(object)) {
            skinnedMeshes.push(object);
        }
    });
    return skinnedMeshes;
}

function chainInAnySkeleton(skinnedMeshes: SkinnedMesh[], chain: ArmChain): boolean {
    if (
        !isBoneObject(chain.upperArm) ||
        !isBoneObject(chain.lowerArm) ||
        !isBoneObject(chain.hand)
    ) {
        return false;
    }
    const upperArm = chain.upperArm;
    const lowerArm = chain.lowerArm;
    const hand = chain.hand;
    return skinnedMeshes.some((mesh) => {
        const bones = mesh.skeleton.bones;
        return bones.includes(upperArm) && bones.includes(lowerArm) && bones.includes(hand);
    });
}

function findCcdIkChain(skinnedMeshes: SkinnedMesh[], chain: ArmChain): CcdIkChain | undefined {
    if (
        !isBoneObject(chain.upperArm) ||
        !isBoneObject(chain.lowerArm) ||
        !isBoneObject(chain.hand)
    ) {
        return undefined;
    }
    const upperBone = chain.upperArm;
    const lowerBone = chain.lowerArm;
    const handBone = chain.hand;
    for (const mesh of skinnedMeshes) {
        const bones = mesh.skeleton.bones;
        const upperIndex = bones.indexOf(upperBone);
        const lowerIndex = bones.indexOf(lowerBone);
        const handIndex = bones.indexOf(handBone);
        if (upperIndex < 0 || lowerIndex < 0 || handIndex < 0) {
            continue;
        }
        if (handBone.parent !== lowerBone || lowerBone.parent !== upperBone) {
            continue;
        }
        return {
            mesh,
            upperIndex,
            lowerIndex,
            handIndex,
            upperBone,
            lowerBone,
            handBone,
        };
    }
    return undefined;
}

function isSkinnedMeshObject(object: Object3D): object is SkinnedMesh {
    return object instanceof SkinnedMesh;
}

function isBoneObject(object: Object3D | undefined): object is Bone {
    return object instanceof Bone;
}

function smokeTestCcdIk(chain: CcdIkChain): string | undefined {
    const targetBone = createProbeTargetBone(chain);
    const targetIndex = chain.mesh.skeleton.bones.length;
    const initialQuaternions = new Map<Bone, Quaternion>([
        [chain.upperBone, chain.upperBone.quaternion.clone()],
        [chain.lowerBone, chain.lowerBone.quaternion.clone()],
        [chain.handBone, chain.handBone.quaternion.clone()],
    ]);
    chain.mesh.skeleton.bones.push(targetBone);
    chain.mesh.skeleton.boneInverses.push(new Matrix4());
    chain.mesh.add(targetBone);
    chain.mesh.updateMatrixWorld(true);
    targetBone.updateMatrixWorld(true);

    try {
        const ik: IK = {
            target: targetIndex,
            effector: chain.handIndex,
            links: [{ index: chain.lowerIndex }, { index: chain.upperIndex }],
            iteration: 1,
            maxAngle: MathUtils.degToRad(8),
            blendFactor: 0,
        };
        new CCDIKSolver(chain.mesh, [ik]).update();
        return undefined;
    } catch (error) {
        return error instanceof Error ? error.message : "unknown_ccdik_error";
    } finally {
        for (const [bone, quaternion] of initialQuaternions) {
            bone.quaternion.copy(quaternion);
        }
        chain.mesh.skeleton.bones.pop();
        chain.mesh.skeleton.boneInverses.pop();
        targetBone.removeFromParent();
        chain.mesh.updateMatrixWorld(true);
    }
}

function createProbeTargetBone(chain: CcdIkChain): Bone {
    const targetBone = new Bone();
    targetBone.name = `SincroCcdIkProbe_${chain.handBone.name}_Target`;
    const upperWorld = chain.upperBone.getWorldPosition(new Vector3());
    const handWorld = chain.handBone.getWorldPosition(new Vector3());
    const targetWorld = handWorld
        .clone()
        .lerp(upperWorld, 0.08)
        .add(new Vector3(0, 0.015, 0));
    chain.mesh.worldToLocal(targetWorld);
    targetBone.position.copy(targetWorld);
    return targetBone;
}
