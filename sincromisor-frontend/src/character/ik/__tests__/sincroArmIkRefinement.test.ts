import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { describe, expect, it } from "vitest";
import type { SincroArmIkVrmSource } from "../sincroArmIkSkeleton";
import { SincroArmIkSolver } from "../sincroArmIkSolver";
import type { SincroArmIkTarget } from "../sincroArmIkTypes";

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

function stableTarget(wrist: Vector3): SincroArmIkTarget {
    return {
        wrist,
        elbowPole: new Vector3(0, 1, 0),
        weight: 1,
        targetReachRatio: 0.5,
    };
}

function readLastPoleDirection(solver: SincroArmIkSolver): Vector3 {
    const value = Reflect.get(solver, "lastPoleDirection");
    if (value instanceof Vector3) {
        return value;
    }
    throw new Error("lastPoleDirection was not committed");
}

function expectVectorClose(actual: Vector3, expected: Vector3): void {
    expect(actual.x).toBeCloseTo(expected.x, 6);
    expect(actual.y).toBeCloseTo(expected.y, 6);
    expect(actual.z).toBeCloseTo(expected.z, 6);
}

describe("SincroArmIkSolver solveRefined", () => {
    it("returns the same result as solve when refinement is disabled", () => {
        const target = stableTarget(new Vector3(-0.35, 0.04, 0.12));
        const refined = createLeftSolver().solveRefined(target);
        const plain = createLeftSolver().solve(target);

        expect(refined).toEqual(plain);
        expect(refined?.refinement).toBeUndefined();
        expect(refined?.constraint.reasonCodes).not.toContain("phase11_ik_refined");
    });

    it("keeps candidate index order as original, reach outer, elevation middle, depth inner", () => {
        const result = createLeftSolver().solveRefined(stableTarget(new Vector3(-0.32, 0, 0.18)), {
            enabled: true,
        });

        expect(result?.refinement?.candidates.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4]);
        expect(
            result?.refinement?.candidates.map(
                ({ reachScale, elevationOffsetRad, depthScale }) => ({
                    reachScale,
                    elevationOffsetRad,
                    depthScale,
                }),
            ),
        ).toEqual([
            { reachScale: 1, elevationOffsetRad: 0, depthScale: 1 },
            { reachScale: 1, elevationOffsetRad: 0, depthScale: 0.9 },
            { reachScale: 1, elevationOffsetRad: -0.035, depthScale: 1 },
            { reachScale: 1, elevationOffsetRad: -0.035, depthScale: 0.9 },
            { reachScale: 0.97, elevationOffsetRad: 0, depthScale: 1 },
        ]);
    });

    it("rejects candidates that exceed the target delta limit", () => {
        const result = createLeftSolver().solveRefined(stableTarget(new Vector3(-0.32, 0, 0.18)), {
            enabled: true,
            maxTargetDeltaRatio: 0.001,
        });

        expect(result?.refinement?.selectedCandidateIndex).toBe(0);
        expect(
            result?.refinement?.candidates.slice(1).map(({ rejected, rejectReason }) => ({
                rejected,
                rejectReason,
            })),
        ).toEqual([
            { rejected: true, rejectReason: "target_delta_exceeded" },
            { rejected: true, rejectReason: "target_delta_exceeded" },
            { rejected: true, rejectReason: "target_delta_exceeded" },
            { rejected: true, rejectReason: "target_delta_exceeded" },
        ]);
    });

    it("selects a lower cost candidate and marks the solve result as refined", () => {
        const solver = createLeftSolver();
        const armLength = solver.upperArmLength + solver.lowerArmLength;
        const result = solver.solveRefined(stableTarget(new Vector3(-armLength * 0.94, 0, 0.12)), {
            enabled: true,
        });

        expect(result?.refinement?.applied).toBe(true);
        expect(result?.refinement?.selectedCandidateIndex).not.toBe(0);
        expect(result?.refinement?.selectedCost).toBeLessThan(
            result?.refinement?.originalCost ?? 0,
        );
        expect(result?.constraint.reasonCodes).toEqual(
            expect.arrayContaining(["phase11_ik_refined"]),
        );
    });

    it("keeps the original candidate when costs tie", () => {
        const result = createLeftSolver().solveRefined(stableTarget(new Vector3(-0.34, 0, 0)), {
            enabled: true,
            reachScales: [1],
            elevationOffsetsRad: [0],
            depthScales: [1, 0.9],
        });

        expect(result?.refinement?.candidateCount).toBe(2);
        expect(result?.refinement?.selectedCandidateIndex).toBe(0);
        expect(result?.refinement?.selectedCost).toBe(result?.refinement?.originalCost);
        expect(result?.refinement?.applied).toBe(false);
        expect(result?.constraint.reasonCodes).not.toContain("phase11_ik_refined");
    });

    it("commits lastPoleDirection only for the selected candidate", () => {
        const target = stableTarget(new Vector3(-0.32, 0.04, 0.2));
        const refinedSolver = createLeftSolver();
        const plainSolver = createLeftSolver();

        const refined = refinedSolver.solveRefined(target, {
            enabled: true,
            reachScales: [1],
            elevationOffsetsRad: [0, -0.035],
            depthScales: [1, 0.9],
        });
        const plain = plainSolver.solve(target);

        expect(refined?.refinement?.selectedCandidateIndex).toBe(0);
        expect(plain).toBeDefined();
        expectVectorClose(readLastPoleDirection(refinedSolver), readLastPoleDirection(plainSolver));
    });

    it("returns a JSON serializable refinement result", () => {
        const result = createLeftSolver().solveRefined(stableTarget(new Vector3(-0.32, 0, 0.18)), {
            enabled: true,
        });
        const refinement = result?.refinement;
        if (!refinement) {
            throw new Error("refinement result was missing");
        }

        expect(JSON.parse(JSON.stringify(refinement))).toEqual(refinement);
    });
});
