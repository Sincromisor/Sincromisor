import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { describe, expect, it } from "vitest";
import type { SincroArmIkVrmSource } from "../sincroArmIkSkeleton";
import { SincroArmIkSolver } from "../sincroArmIkSolver";

function createObjectAt(x: number, y: number, z: number): Object3D {
    const object = new Object3D();
    object.position.set(x, y, z);
    return object;
}

function createArmVrmSource(): SincroArmIkVrmSource {
    const scene = new Object3D();
    const leftUpperArm = createObjectAt(0, 0, 0);
    const leftLowerArm = createObjectAt(0, -0.45, 0.2);
    const leftHand = createObjectAt(0, -0.45, 0.2);
    const rightUpperArm = createObjectAt(0.5, 0, 0);

    scene.add(leftUpperArm);
    leftUpperArm.add(leftLowerArm);
    leftLowerArm.add(leftHand);
    scene.add(rightUpperArm);
    scene.updateMatrixWorld(true);

    const bones = new Map<VRMHumanBoneName, Object3D>([
        ["leftUpperArm", leftUpperArm],
        ["leftLowerArm", leftLowerArm],
        ["leftHand", leftHand],
        ["rightUpperArm", rightUpperArm],
    ]);

    return {
        scene,
        humanoid: {
            getNormalizedBoneNode(name: VRMHumanBoneName) {
                return bones.get(name) ?? null;
            },
        },
    };
}

function createLeftSolver(): SincroArmIkSolver {
    const solver = SincroArmIkSolver.fromVrm(createArmVrmSource(), "left");
    if (!solver) {
        throw new Error("failed to create test arm IK solver");
    }
    return solver;
}

describe("SincroArmIkSolver", () => {
    it("stores default target reach ratio as extended pole state and clamps wrist roll influence", () => {
        const solver = createLeftSolver();
        const armLength = solver.upperArmLength + solver.lowerArmLength;
        const result = solver.solve({
            wrist: new Vector3(armLength * 0.97, 0, 0),
            elbowPole: new Vector3(0, 1, 0),
            weight: 0.8,
            wristRollInfluence: 1.5,
        });

        expect(result).toBeDefined();
        expect(result?.constraint.poleState).toBe("extended");
        expect(result?.constraint.reasonCodes).toEqual(
            expect.arrayContaining(["elbow_pole_stabilized"]),
        );
        expect(result?.constraint.wristRollInfluence).toBe(1);
        expect(result?.constraint.wristRollDamped).toBe(false);
        expect(result?.constraint.angularVelocityClamped).toBe(false);
    });

    it("propagates pole reason codes and multiplies pole weight scale into solver weight", () => {
        const solver = createLeftSolver();
        const target = new Vector3(0.55, 0, 0);

        const firstResult = solver.solve({
            wrist: target,
            elbowPole: new Vector3(0, 1, 0),
            weight: 1,
            targetReachRatio: 0.5,
        });
        expect(firstResult).toBeDefined();

        const flippedResult = solver.solve({
            wrist: target,
            elbowPole: new Vector3(0, -1, 0),
            weight: 0.5,
            targetReachRatio: 0.5,
        });

        expect(flippedResult).toBeDefined();
        expect(flippedResult?.constraint.poleState).toBe("uncertain");
        expect(flippedResult?.constraint.reasonCodes).toEqual(
            expect.arrayContaining(["pole_flip_rejected"]),
        );
        expect(flippedResult?.constraint.weightScale).toBeLessThanOrEqual(0.68);
        expect(flippedResult?.weight).toBeCloseTo(
            0.5 * (flippedResult?.constraint.weightScale ?? 0),
        );
    });
});
