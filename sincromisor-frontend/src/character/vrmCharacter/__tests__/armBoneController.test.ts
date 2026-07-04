import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { describe, expect, it, vi } from "vitest";
import type { SincroVrmPoseComposerDryRunResult } from "../../runtime/sincroVrmPoseComposerDryRun";
import type { VrmPoseQuaternion } from "../../vrmPose/vrmPoseTypes";
import { ArmBoneController } from "../armBoneController";
import { VRMCharacterManager } from "../vrmCharacterManager";

describe("ArmBoneController composer arm application", () => {
    it("keeps the direct write path when composer arm application is off", () => {
        const { controller, nodes, setNormalizedPose } = createController();
        const composerQuaternion = eulerQuaternion(0.9, 0.1, -0.2);

        const result = controller.update(0, undefined, undefined, {
            mode: "off",
            composerDryRun: {
                status: "not_ready",
                warnings: ["retarget_frame_not_ready"],
            },
        });

        expect(result.composerArmApplicationWarnings).toEqual([]);
        expectQuaternionNotEqual(nodes.leftUpperArm.quaternion, composerQuaternion);
        expect(setNormalizedPose).not.toHaveBeenCalled();
    });

    it("applies composer final pose only to the selected arm bones", () => {
        const { controller, nodes } = createController();
        const leftUpperArm = eulerQuaternion(0.8, 0.1, 0);
        const leftLowerArm = eulerQuaternion(0.1, -0.5, 0);
        const leftHand = eulerQuaternion(0, 0.2, 0.7);
        const rightUpperArm = eulerQuaternion(-0.8, 0.1, 0);

        const result = controller.update(0, undefined, undefined, {
            mode: "left",
            composerDryRun: createAvailableDryRun({
                leftUpperArm,
                leftLowerArm,
                leftHand,
                rightUpperArm,
            }),
        });

        expect(result.composerArmApplicationWarnings).toEqual([]);
        expectQuaternionEqual(nodes.leftUpperArm.quaternion, leftUpperArm);
        expectQuaternionEqual(nodes.leftLowerArm.quaternion, leftLowerArm);
        expectQuaternionEqual(nodes.leftHand.quaternion, leftHand);
        expectQuaternionNotEqual(nodes.rightUpperArm.quaternion, rightUpperArm);
    });

    it("applies right mode only to right arm bones without warning for left arm gaps", () => {
        const { controller, nodes } = createController({ missingBones: ["leftHand"] });
        const leftUpperArm = eulerQuaternion(0.8, 0.1, 0);
        const rightUpperArm = eulerQuaternion(-0.8, 0.1, 0);
        const rightLowerArm = eulerQuaternion(0.2, 0.5, 0);
        const rightHand = eulerQuaternion(0, -0.2, -0.7);

        const result = controller.update(0, undefined, undefined, {
            mode: "right",
            composerDryRun: createAvailableDryRun({
                leftUpperArm,
                rightUpperArm,
                rightLowerArm,
                rightHand,
            }),
        });

        expect(result.composerArmApplicationWarnings).toEqual([]);
        expectQuaternionNotEqual(nodes.leftUpperArm.quaternion, leftUpperArm);
        expectQuaternionEqual(nodes.rightUpperArm.quaternion, rightUpperArm);
        expectQuaternionEqual(nodes.rightLowerArm.quaternion, rightLowerArm);
        expectQuaternionEqual(nodes.rightHand.quaternion, rightHand);
    });

    it("applies both arm modes without taking ownership of shoulders, torso, fingers, head, or expression", () => {
        const { controller, nodes, setNormalizedPose } = createController();
        const leftUpperArm = eulerQuaternion(0.8, 0.1, 0);
        const leftLowerArm = eulerQuaternion(0.1, -0.5, 0);
        const leftHand = eulerQuaternion(0, 0.2, 0.7);
        const rightUpperArm = eulerQuaternion(-0.8, 0.1, 0);
        const rightLowerArm = eulerQuaternion(0.2, 0.5, 0);
        const rightHand = eulerQuaternion(0, -0.2, -0.7);
        const ignored = eulerQuaternion(0.4, 0.4, 0.4);

        const result = controller.update(0, undefined, undefined, {
            mode: "both",
            composerDryRun: createAvailableDryRun({
                chest: ignored,
                head: ignored,
                leftShoulder: ignored,
                leftUpperArm,
                leftLowerArm,
                leftHand,
                leftThumbProximal: ignored,
                rightShoulder: ignored,
                rightUpperArm,
                rightLowerArm,
                rightHand,
                rightThumbProximal: ignored,
            }),
        });

        expect(result.composerArmApplicationWarnings).toEqual([]);
        expectQuaternionEqual(nodes.leftUpperArm.quaternion, leftUpperArm);
        expectQuaternionEqual(nodes.leftLowerArm.quaternion, leftLowerArm);
        expectQuaternionEqual(nodes.leftHand.quaternion, leftHand);
        expectQuaternionEqual(nodes.rightUpperArm.quaternion, rightUpperArm);
        expectQuaternionEqual(nodes.rightLowerArm.quaternion, rightLowerArm);
        expectQuaternionEqual(nodes.rightHand.quaternion, rightHand);
        expectQuaternionNotEqual(nodes.leftThumbProximal.quaternion, ignored);
        expectQuaternionNotEqual(nodes.rightThumbProximal.quaternion, ignored);
        expect(setNormalizedPose).not.toHaveBeenCalled();
    });

    it("falls back to direct writes when dry-run is not available", () => {
        const { controller, nodes } = createController();
        const before = nodes.leftUpperArm.quaternion.clone();

        const result = controller.update(0, undefined, undefined, {
            mode: "left",
            composerDryRun: {
                status: "not_ready",
                warnings: ["retarget_frame_not_ready"],
            },
        });

        expect(result.composerArmApplicationWarnings).toEqual([
            "composer_arm_application_unavailable:not_ready",
        ]);
        expect(nodes.leftUpperArm.quaternion.angleTo(before)).toBeGreaterThan(0);
    });

    it("warns without changing direct writes when an available dry-run has no result", () => {
        const { controller, nodes } = createController();
        const before = nodes.leftUpperArm.quaternion.clone();

        const result = controller.update(0, undefined, undefined, {
            mode: "left",
            composerDryRun: {
                status: "available",
                warnings: [],
            },
        });

        expect(result.composerArmApplicationWarnings).toEqual([
            "composer_arm_application_result_missing",
        ]);
        expect(nodes.leftUpperArm.quaternion.angleTo(before)).toBeGreaterThan(0);
    });

    it("falls back per missing target bone and still applies available target bones", () => {
        const { controller, nodes } = createController();
        const leftUpperArm = eulerQuaternion(0.8, 0.1, 0);
        const leftLowerBefore = nodes.leftLowerArm.quaternion.clone();
        controller.update(0);

        const result = controller.update(0, undefined, undefined, {
            mode: "left",
            composerDryRun: createAvailableDryRun({
                leftUpperArm,
                leftHand: eulerQuaternion(0, 0, 0.6),
            }),
        });

        expect(result.composerArmApplicationWarnings).toEqual([
            "composer_arm_application_final_pose_missing:leftLowerArm",
        ]);
        expectQuaternionEqual(nodes.leftUpperArm.quaternion, leftUpperArm);
        expect(nodes.leftLowerArm.quaternion.angleTo(leftLowerBefore)).toBeGreaterThan(0);
    });

    it("warns per missing normalized bone node while applying available nodes", () => {
        const { controller, nodes } = createController({ missingBones: ["leftHand"] });
        const leftUpperArm = eulerQuaternion(0.8, 0.1, 0);
        const leftHand = eulerQuaternion(0, 0, 0.6);

        const result = controller.update(0, undefined, undefined, {
            mode: "left",
            composerDryRun: createAvailableDryRun({
                leftUpperArm,
                leftLowerArm: eulerQuaternion(0.1, -0.5, 0),
                leftHand,
            }),
        });

        expect(result.composerArmApplicationWarnings).toEqual([
            "composer_arm_application_normalized_node_missing:leftHand",
        ]);
        expectQuaternionEqual(nodes.leftUpperArm.quaternion, leftUpperArm);
        expectQuaternionNotEqual(nodes.leftHand.quaternion, leftHand);
    });
});

describe("VRMCharacterManager composer arm application lifecycle", () => {
    it("resets production dry-run previous final pose when composer arm application mode changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as ComposerModeManagerTestDouble;
        Object.assign(manager, {
            composerArmApplicationMode: "off",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ composerArmApplicationMode: "left" });

        expect(reset).toHaveBeenCalledTimes(1);
        expect(manager.composerArmApplicationMode).toBe("left");
        expect(setConfig).toHaveBeenCalledWith({ composerArmApplicationMode: "left" });
    });

    it("keeps dry-run previous final pose when unrelated retarget config changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as ComposerModeManagerTestDouble;
        Object.assign(manager, {
            composerArmApplicationMode: "left",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ intensityScale: 0.5 });

        expect(reset).not.toHaveBeenCalled();
        expect(manager.composerArmApplicationMode).toBe("left");
        expect(setConfig).toHaveBeenCalledWith({ intensityScale: 0.5 });
    });
});

type ComposerModeManagerTestDouble = {
    setSincroPoseRetargetConfig: VRMCharacterManager["setSincroPoseRetargetConfig"];
    composerArmApplicationMode: "off" | "left" | "right" | "both";
    composerDryRun: { reset: () => void };
    sincroPoseRetargeter: { setConfig: (config: unknown) => void };
};

function createController(options?: { missingBones?: VRMHumanBoneName[] }): {
    controller: ArmBoneController;
    nodes: Record<
        | "leftUpperArm"
        | "leftLowerArm"
        | "leftHand"
        | "leftThumbProximal"
        | "rightUpperArm"
        | "rightLowerArm"
        | "rightHand"
        | "rightThumbProximal",
        Object3D
    >;
    setNormalizedPose: ReturnType<typeof vi.fn>;
} {
    const nodes: Record<
        | "leftUpperArm"
        | "leftLowerArm"
        | "leftHand"
        | "leftThumbProximal"
        | "rightUpperArm"
        | "rightLowerArm"
        | "rightHand"
        | "rightThumbProximal",
        Object3D
    > = {
        leftUpperArm: new Object3D(),
        leftLowerArm: new Object3D(),
        leftHand: new Object3D(),
        leftThumbProximal: new Object3D(),
        rightUpperArm: new Object3D(),
        rightLowerArm: new Object3D(),
        rightHand: new Object3D(),
        rightThumbProximal: new Object3D(),
    };
    const humanoidNodes: Partial<Record<VRMHumanBoneName, Object3D>> = { ...nodes };
    for (const missingBone of options?.missingBones ?? []) {
        delete humanoidNodes[missingBone];
    }
    const setNormalizedPose = vi.fn();
    const vrm = {
        humanoid: {
            getNormalizedBoneNode: (name: VRMHumanBoneName) => humanoidNodes[name],
            setNormalizedPose,
        },
    } as unknown as VRM;

    return {
        controller: new ArmBoneController(vrm),
        nodes,
        setNormalizedPose,
    };
}

function createAvailableDryRun(
    finalPose: Partial<Record<VRMHumanBoneName, VrmPoseQuaternion>>,
): SincroVrmPoseComposerDryRunResult {
    return {
        status: "available",
        warnings: [],
        result: {
            finalPose,
            ownedBones: Object.keys(finalPose) as VRMHumanBoneName[],
            suppressedLayers: [],
            clampedBones: [],
            warnings: [],
        },
    };
}

function eulerQuaternion(x: number, y: number, z: number): VrmPoseQuaternion {
    const quaternion = new Quaternion().setFromEuler(new Euler(x, y, z, "XYZ"));
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

function expectQuaternionEqual(received: Quaternion, expected: VrmPoseQuaternion): void {
    expect(received.angleTo(toQuaternion(expected))).toBeLessThan(0.000001);
}

function expectQuaternionNotEqual(received: Quaternion, expected: VrmPoseQuaternion): void {
    expect(received.angleTo(toQuaternion(expected))).toBeGreaterThan(0.001);
}

function toQuaternion(value: VrmPoseQuaternion): Quaternion {
    return new Quaternion(value.x, value.y, value.z, value.w).normalize();
}
