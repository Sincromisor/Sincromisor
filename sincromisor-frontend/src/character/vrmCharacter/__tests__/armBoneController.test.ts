import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { Object3D } from "three/src/core/Object3D.js";
import { Euler } from "three/src/math/Euler.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import { Vector3 } from "three/src/math/Vector3.js";
import { describe, expect, it, vi } from "vitest";
import { DebugConsoleManager } from "../../../features/debug/model/debugConsoleManager";
import {
    buildCharacterBehaviorSnapshot,
    createDefaultBehaviorAiSpeechSnapshot,
    createDefaultBehaviorFaceMotionSnapshot,
    createDefaultBehaviorGazeSnapshot,
    createDefaultBehaviorPoseMotionSnapshot,
    createDefaultBehaviorVadSnapshot,
} from "../../behavior/characterBehaviorSnapshots";
import type { CharacterBehaviorSnapshot } from "../../behavior/characterBehaviorTypes";
import { NEUTRAL_POSE_FRAME } from "../../retargeting/sincroPoseRetargetTypes";
import { createDefaultSincroMotionPipelineState } from "../../runtime/sincroMotionPipelineState";
import type { SincroVrmPoseComposerDryRunResult } from "../../runtime/sincroVrmPoseComposerDryRun";
import type { VrmPoseQuaternion } from "../../vrmPose/vrmPoseTypes";
import { ArmBoneController } from "../armBoneController";
import { applyFullNormalizedPoseApplication, VRMCharacterManager } from "../vrmCharacterManager";

const FULL_NORMALIZED_POSE_APPLICATION_TEST_BONES: readonly VRMHumanBoneName[] = [
    "spine",
    "chest",
    "upperChest",
    "leftShoulder",
    "rightShoulder",
    "leftUpperArm",
    "leftLowerArm",
    "leftHand",
    "rightUpperArm",
    "rightLowerArm",
    "rightHand",
    "leftThumbMetacarpal",
    "leftThumbProximal",
    "leftThumbDistal",
    "leftIndexProximal",
    "leftIndexIntermediate",
    "leftIndexDistal",
    "leftMiddleProximal",
    "leftMiddleIntermediate",
    "leftMiddleDistal",
    "leftRingProximal",
    "leftRingIntermediate",
    "leftRingDistal",
    "leftLittleProximal",
    "leftLittleIntermediate",
    "leftLittleDistal",
    "rightThumbMetacarpal",
    "rightThumbProximal",
    "rightThumbDistal",
    "rightIndexProximal",
    "rightIndexIntermediate",
    "rightIndexDistal",
    "rightMiddleProximal",
    "rightMiddleIntermediate",
    "rightMiddleDistal",
    "rightRingProximal",
    "rightRingIntermediate",
    "rightRingDistal",
    "rightLittleProximal",
    "rightLittleIntermediate",
    "rightLittleDistal",
];

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
            composerTorsoShoulderApplicationMode: "direct",
            composerSemanticFingerApplicationMode: "composer",
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
            composerTorsoShoulderApplicationMode: "direct",
            composerSemanticFingerApplicationMode: "composer",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ intensityScale: 0.5 });

        expect(reset).not.toHaveBeenCalled();
        expect(manager.composerArmApplicationMode).toBe("left");
        expect(setConfig).toHaveBeenCalledWith({ intensityScale: 0.5 });
    });

    it("keeps torso and shoulder composer mode independent from arm mode changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as ComposerModeManagerTestDouble;
        Object.assign(manager, {
            composerArmApplicationMode: "off",
            composerTorsoShoulderApplicationMode: "direct",
            composerSemanticFingerApplicationMode: "composer",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ composerArmApplicationMode: "both" });

        expect(reset).toHaveBeenCalledTimes(1);
        expect(manager.composerArmApplicationMode).toBe("both");
        expect(manager.composerTorsoShoulderApplicationMode).toBe("direct");
        expect(setConfig).toHaveBeenCalledWith({ composerArmApplicationMode: "both" });
    });

    it("keeps arm composer mode independent from torso and shoulder mode changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as ComposerModeManagerTestDouble;
        Object.assign(manager, {
            composerArmApplicationMode: "left",
            composerTorsoShoulderApplicationMode: "direct",
            composerSemanticFingerApplicationMode: "composer",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ composerTorsoShoulderApplicationMode: "composer" });

        expect(reset).toHaveBeenCalledTimes(1);
        expect(manager.composerArmApplicationMode).toBe("left");
        expect(manager.composerTorsoShoulderApplicationMode).toBe("composer");
        expect(setConfig).toHaveBeenCalledWith({
            composerTorsoShoulderApplicationMode: "composer",
        });
    });

    it("keeps semantic and finger composer mode independent from arm and torso modes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as ComposerModeManagerTestDouble;
        Object.assign(manager, {
            composerArmApplicationMode: "left",
            composerTorsoShoulderApplicationMode: "composer",
            composerSemanticFingerApplicationMode: "composer",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ composerSemanticFingerApplicationMode: "off" });

        expect(reset).toHaveBeenCalledTimes(1);
        expect(manager.composerArmApplicationMode).toBe("left");
        expect(manager.composerTorsoShoulderApplicationMode).toBe("composer");
        expect(manager.composerSemanticFingerApplicationMode).toBe("off");
        expect(setConfig).toHaveBeenCalledWith({ composerSemanticFingerApplicationMode: "off" });
    });

    it("resets production dry-run previous final pose when full normalized pose mode changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as ComposerModeManagerTestDouble;
        Object.assign(manager, {
            composerArmApplicationMode: "left",
            composerTorsoShoulderApplicationMode: "composer",
            composerSemanticFingerApplicationMode: "composer",
            fullNormalizedPoseApplicationMode: "off",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ fullNormalizedPoseApplicationMode: "upper_body" });

        expect(reset).toHaveBeenCalledTimes(1);
        expect(manager.composerArmApplicationMode).toBe("left");
        expect(manager.composerTorsoShoulderApplicationMode).toBe("composer");
        expect(manager.composerSemanticFingerApplicationMode).toBe("composer");
        expect(manager.fullNormalizedPoseApplicationMode).toBe("upper_body");
        expect(setConfig).toHaveBeenCalledWith({
            fullNormalizedPoseApplicationMode: "upper_body",
        });
    });
});

describe("VRMCharacterManager full normalized pose application", () => {
    it("applies available finalPose once without using setNormalizedPose in off mode", () => {
        const { vrm, setNormalizedPose } = createVrmWithSetNormalizedPose();
        const finalPose = { leftUpperArm: eulerQuaternion(0.8, 0.1, 0) };
        const dryRun = createAvailableDryRun(finalPose);

        const offResult = applyFullNormalizedPoseApplication(vrm, "off", dryRun);
        const fullResult = applyFullNormalizedPoseApplication(vrm, "upper_body", dryRun);

        expect(offResult).toEqual({
            mode: "off",
            applied: false,
            rollbackReason: "full_normalized_pose_application_off",
            warnings: [],
        });
        expect(fullResult).toEqual({ mode: "upper_body", applied: true, warnings: [] });
        expect(setNormalizedPose).toHaveBeenCalledTimes(1);
        expect(setNormalizedPose).toHaveBeenCalledWith(toVrmPose(finalPose));
    });

    it("does not promote stale finalPose when the current dry-run frame is unavailable", () => {
        const { vrm, setNormalizedPose } = createVrmWithSetNormalizedPose();

        const result = applyFullNormalizedPoseApplication(vrm, "upper_body", {
            status: "missing_profile",
            warnings: ["avatar_motion_profile_missing"],
        });

        expect(result).toEqual({
            mode: "upper_body",
            applied: false,
            rollbackReason: "full_normalized_pose_application_unavailable:missing_profile",
            warnings: ["full_normalized_pose_application_unavailable:missing_profile"],
        });
        expect(setNormalizedPose).not.toHaveBeenCalled();
    });

    it("writes identity for missing full-owned finger bones on available frames", () => {
        const { vrm, setNormalizedPose } = createVrmWithSetNormalizedPose();
        const fingerCurl = eulerQuaternion(0.7, 0.1, 0);
        const leftUpperArm = eulerQuaternion(0.8, 0.1, 0);

        applyFullNormalizedPoseApplication(
            vrm,
            "upper_body",
            createAvailableDryRun({ leftIndexProximal: fingerCurl }),
        );
        applyFullNormalizedPoseApplication(
            vrm,
            "upper_body",
            createAvailableDryRun({ leftUpperArm }),
        );

        expect(setNormalizedPose).toHaveBeenCalledTimes(2);
        expect(setNormalizedPose).toHaveBeenNthCalledWith(
            1,
            toVrmPose({ leftIndexProximal: fingerCurl }),
        );
        expect(setNormalizedPose).toHaveBeenNthCalledWith(2, toVrmPose({ leftUpperArm }));
        expect(setNormalizedPose.mock.calls[1]?.[0]).toEqual(
            expect.objectContaining({
                leftIndexProximal: { rotation: [0, 0, 0, 1] },
                leftIndexIntermediate: { rotation: [0, 0, 0, 1] },
                leftIndexDistal: { rotation: [0, 0, 0, 1] },
            }),
        );
    });

    it("clears previous full-owned finger pose before unavailable rollback", () => {
        const { vrm, setNormalizedPose } = createVrmWithSetNormalizedPose();
        const fingerCurl = eulerQuaternion(0.7, 0.1, 0);

        applyFullNormalizedPoseApplication(
            vrm,
            "upper_body",
            createAvailableDryRun({ leftIndexProximal: fingerCurl }),
        );
        const rollbackResult = applyFullNormalizedPoseApplication(
            vrm,
            "upper_body",
            {
                status: "not_ready",
                warnings: ["retarget_frame_not_ready"],
            },
            { clearPreviousApplication: true },
        );

        expect(rollbackResult).toEqual({
            mode: "upper_body",
            applied: false,
            rollbackReason: "full_normalized_pose_application_unavailable:not_ready",
            warnings: ["full_normalized_pose_application_unavailable:not_ready"],
        });
        expect(setNormalizedPose).toHaveBeenCalledTimes(2);
        expect(setNormalizedPose).toHaveBeenNthCalledWith(2, toVrmPose({}));
    });

    it("skips direct upper body controllers when full finalPose applies", () => {
        const debugManager = createDebugManagerDouble();
        const debugSpy = vi
            .spyOn(DebugConsoleManager, "getManager")
            .mockReturnValue(debugManager as unknown as DebugConsoleManager);
        const snapshot = createBehaviorSnapshot();
        const finalPose = { leftUpperArm: eulerQuaternion(0.8, 0.1, 0) };
        const dryRun = createAvailableDryRun(finalPose);
        const armUpdate = vi.fn();
        const motionUpdate = vi.fn();
        const { manager, setNormalizedPose } = createUpdateManagerDouble({
            snapshot,
            dryRun,
            armUpdate,
            motionUpdate,
            fullNormalizedPoseApplicationMode: "upper_body",
        });

        try {
            manager.update(1000);
        } finally {
            debugSpy.mockRestore();
        }

        expect(setNormalizedPose).toHaveBeenCalledTimes(1);
        expect(setNormalizedPose).toHaveBeenCalledWith(toVrmPose(finalPose));
        expect(armUpdate).not.toHaveBeenCalled();
        expect(motionUpdate).not.toHaveBeenCalled();
        expect(manager.legBoneController.update).toHaveBeenCalledTimes(1);
        expect(manager.vrm.update).toHaveBeenCalledTimes(1);
        expect(debugManager.updateSincroComposerDryRunSummary).toHaveBeenLastCalledWith(
            expect.objectContaining({
                fullNormalizedPoseApplication: {
                    mode: "upper_body",
                    applied: true,
                    rollbackReason: undefined,
                },
            }),
        );
    });

    it("rolls back to staged application when full finalPose is unavailable", () => {
        const debugManager = createDebugManagerDouble();
        const debugSpy = vi
            .spyOn(DebugConsoleManager, "getManager")
            .mockReturnValue(debugManager as unknown as DebugConsoleManager);
        const snapshot = createBehaviorSnapshot();
        const armUpdate = vi.fn(() => ({ composerArmApplicationWarnings: [] }));
        const motionUpdate = vi.fn(() => ({ composerTorsoShoulderApplicationWarnings: [] }));
        const { manager, setNormalizedPose } = createUpdateManagerDouble({
            snapshot,
            dryRun: { status: "invalid_input", warnings: ["delta_seconds_invalid"] },
            armUpdate,
            motionUpdate,
            fullNormalizedPoseApplicationMode: "upper_body",
        });

        try {
            manager.update(1000);
        } finally {
            debugSpy.mockRestore();
        }

        expect(setNormalizedPose).not.toHaveBeenCalled();
        expect(armUpdate).toHaveBeenCalledTimes(1);
        expect(motionUpdate).toHaveBeenCalledTimes(1);
        expect(debugManager.updateSincroComposerDryRunSummary).toHaveBeenLastCalledWith(
            expect.objectContaining({
                warnings: [
                    "delta_seconds_invalid",
                    "full_normalized_pose_application_unavailable:invalid_input",
                ],
                fullNormalizedPoseApplication: {
                    mode: "upper_body",
                    applied: false,
                    rollbackReason: "full_normalized_pose_application_unavailable:invalid_input",
                },
            }),
        );
    });

    it("clears previous full application before staged rollback writers run", () => {
        const debugManager = createDebugManagerDouble();
        const debugSpy = vi
            .spyOn(DebugConsoleManager, "getManager")
            .mockReturnValue(debugManager as unknown as DebugConsoleManager);
        const snapshot = createBehaviorSnapshot();
        const armUpdate = vi.fn(() => ({ composerArmApplicationWarnings: [] }));
        const motionUpdate = vi.fn(() => ({ composerTorsoShoulderApplicationWarnings: [] }));
        const { manager, setNormalizedPose } = createUpdateManagerDouble({
            snapshot,
            dryRun: { status: "not_ready", warnings: ["retarget_frame_not_ready"] },
            armUpdate,
            motionUpdate,
            fullNormalizedPoseApplicationMode: "upper_body",
            previousFullApplied: true,
        });

        try {
            manager.update(1000);
        } finally {
            debugSpy.mockRestore();
        }

        expect(setNormalizedPose).toHaveBeenCalledTimes(1);
        expect(setNormalizedPose).toHaveBeenCalledWith(toVrmPose({}));
        expect(armUpdate).toHaveBeenCalledTimes(1);
        expect(motionUpdate).toHaveBeenCalledTimes(1);
        expect(setNormalizedPose.mock.invocationCallOrder[0]).toBeLessThan(
            armUpdate.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
        );
    });
});

type ComposerModeManagerTestDouble = {
    setSincroPoseRetargetConfig: VRMCharacterManager["setSincroPoseRetargetConfig"];
    composerArmApplicationMode: "off" | "left" | "right" | "both";
    composerTorsoShoulderApplicationMode: "direct" | "composer";
    composerSemanticFingerApplicationMode: "off" | "composer";
    fullNormalizedPoseApplicationMode: "off" | "upper_body";
    composerDryRun: { reset: () => void };
    sincroPoseRetargeter: { setConfig: (config: unknown) => void };
};

type UpdateManagerTestDouble = VRMCharacterManager & {
    legBoneController: { update: ReturnType<typeof vi.fn> };
    vrm: {
        update: ReturnType<typeof vi.fn>;
        humanoid: { setNormalizedPose: ReturnType<typeof vi.fn> };
    };
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

function createVrmWithSetNormalizedPose(): {
    vrm: VRM;
    setNormalizedPose: ReturnType<typeof vi.fn>;
} {
    const setNormalizedPose = vi.fn();
    return {
        vrm: {
            humanoid: {
                setNormalizedPose,
            },
        } as unknown as VRM,
        setNormalizedPose,
    };
}

function createBehaviorSnapshot(): CharacterBehaviorSnapshot {
    return buildCharacterBehaviorSnapshot({
        talkMode: "sincro",
        motionPolicy: {
            talkMode: "sincro",
            primaryInput: "faceMotion",
            neutralTransition: false,
            allowGazeMotion: false,
            allowFaceRetarget: true,
            allowPoseRetarget: true,
            allowAiSpeechGesture: false,
            allowAiLipSync: false,
            allowAiEmotion: false,
            allowThinkingAversion: false,
            idleMotionScale: 0.42,
        },
        state: "idle",
        previousState: "idle",
        stateChangedAtMs: 0,
        nowMs: 1000,
        vad: createDefaultBehaviorVadSnapshot(),
        gaze: createDefaultBehaviorGazeSnapshot(),
        faceMotion: createDefaultBehaviorFaceMotionSnapshot(),
        poseMotion: createDefaultBehaviorPoseMotionSnapshot(),
        sincroMotionPipeline: createDefaultSincroMotionPipelineState(),
        aiSpeech: createDefaultBehaviorAiSpeechSnapshot(),
    });
}

function createDebugManagerDouble(): Pick<
    DebugConsoleManager,
    | "updateSincroPoseRetargetFrame"
    | "updateSincroComposerDryRunSummary"
    | "updateSincroComposerDryRunResult"
> {
    return {
        updateSincroPoseRetargetFrame: vi.fn(),
        updateSincroComposerDryRunSummary: vi.fn(),
        updateSincroComposerDryRunResult: vi.fn(),
    };
}

function createUpdateManagerDouble(options: {
    snapshot: CharacterBehaviorSnapshot;
    dryRun: SincroVrmPoseComposerDryRunResult;
    armUpdate: ReturnType<typeof vi.fn>;
    motionUpdate: ReturnType<typeof vi.fn>;
    fullNormalizedPoseApplicationMode: "off" | "upper_body";
    previousFullApplied?: boolean;
}): { manager: UpdateManagerTestDouble; setNormalizedPose: ReturnType<typeof vi.fn> } {
    const setNormalizedPose = vi.fn();
    const manager = Object.create(VRMCharacterManager.prototype) as UpdateManagerTestDouble;
    Object.assign(manager, {
        clock: { getDelta: () => 1 / 60 },
        motionElapsedSeconds: 0,
        behaviorState: { update: () => options.snapshot },
        latestBehaviorSnapshot: undefined,
        sincroFaceRetargeter: { retarget: vi.fn(() => ({})) },
        sincroPoseRetargeter: {
            retarget: vi.fn(() => NEUTRAL_POSE_FRAME),
            getAvatarMotionProfile: vi.fn(() => undefined),
        },
        composerDryRun: { compose: vi.fn(() => options.dryRun) },
        composerArmApplicationMode: "both",
        composerTorsoShoulderApplicationMode: "composer",
        composerSemanticFingerApplicationMode: "composer",
        fullNormalizedPoseApplicationMode: options.fullNormalizedPoseApplicationMode,
        fullNormalizedPoseApplicationApplied: options.previousFullApplied ?? false,
        sincroMotionPipelineState: createDefaultSincroMotionPipelineState(),
        headBoneController: { update: vi.fn() },
        eyeBehaviorController: { update: vi.fn() },
        mouthMorphController: { update: vi.fn() },
        emotionMorphController: { update: vi.fn() },
        armBoneController: { update: options.armUpdate },
        legBoneController: { update: vi.fn() },
        motionOrchestrator: { update: options.motionUpdate },
        characterPosition: new Vector3(),
        defaultPosition: new Vector3(),
        rootBone: new Object3D(),
        vrm: {
            update: vi.fn(),
            humanoid: { setNormalizedPose },
        },
    });
    return { manager, setNormalizedPose };
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

function toVrmPose(
    finalPose: Partial<Record<VRMHumanBoneName, VrmPoseQuaternion>>,
): Partial<Record<VRMHumanBoneName, { rotation: [number, number, number, number] }>> {
    const pose: Partial<Record<VRMHumanBoneName, { rotation: [number, number, number, number] }>> =
        {};
    for (const bone of FULL_NORMALIZED_POSE_APPLICATION_TEST_BONES) {
        const quaternion = finalPose[bone];
        if (quaternion === undefined) {
            pose[bone] = { rotation: [0, 0, 0, 1] };
        } else {
            pose[bone] = { rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] };
        }
    }
    return pose;
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
