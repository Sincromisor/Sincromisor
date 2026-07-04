import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { describe, expect, it } from "vitest";
import type { SincroVrmPoseComposerDryRunResult } from "../../runtime/sincroVrmPoseComposerDryRun";
import type { VrmPoseQuaternion } from "../../vrmPose/vrmPoseTypes";
import { ArmBoneController } from "../armBoneController";

describe("ArmBoneController composer arm application", () => {
    it("keeps the direct write path when composer arm application is off", () => {
        const { controller, nodes } = createController();
        const composerQuaternion = eulerQuaternion(0.9, 0.1, -0.2);

        const result = controller.update(0, undefined, undefined, {
            mode: "off",
            composerDryRun: createAvailableDryRun({
                leftUpperArm: composerQuaternion,
            }),
        });

        expect(result.composerArmApplicationWarnings).toEqual([]);
        expectQuaternionNotEqual(nodes.leftUpperArm.quaternion, composerQuaternion);
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
            "composer_arm_application_fallback:leftLowerArm",
        ]);
        expectQuaternionEqual(nodes.leftUpperArm.quaternion, leftUpperArm);
        expect(nodes.leftLowerArm.quaternion.angleTo(leftLowerBefore)).toBeGreaterThan(0);
    });
});

function createController(): {
    controller: ArmBoneController;
    nodes: Record<"leftUpperArm" | "leftLowerArm" | "leftHand" | "rightUpperArm", Object3D>;
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
    const humanoidNodes: Partial<Record<VRMHumanBoneName, Object3D>> = nodes;
    const vrm = {
        humanoid: {
            getNormalizedBoneNode: (name: VRMHumanBoneName) => humanoidNodes[name],
        },
    } as VRM;

    return {
        controller: new ArmBoneController(vrm),
        nodes,
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
