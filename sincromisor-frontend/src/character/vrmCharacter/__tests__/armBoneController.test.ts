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

describe("ArmBoneController direct writer", () => {
    it("does not call setNormalizedPose from the legacy direct arm controller", () => {
        const { controller, nodes, setNormalizedPose } = createController();
        const before = nodes.leftUpperArm.quaternion.clone();

        controller.update(0);

        expect(nodes.leftUpperArm.quaternion.angleTo(before)).toBeGreaterThan(0);
        expect(setNormalizedPose).not.toHaveBeenCalled();
    });
});

describe("VRMCharacterManager full normalized pose application", () => {
    it("applies the available upper-body finalPose once", () => {
        const { vrm, setNormalizedPose } = createVrmWithSetNormalizedPose();
        const finalPose = { leftUpperArm: eulerQuaternion(0.8, 0.1, 0) };

        const result = applyFullNormalizedPoseApplication(vrm, createAvailableDryRun(finalPose));

        expect(result).toEqual({ applied: true, warnings: [] });
        expect(setNormalizedPose).toHaveBeenCalledTimes(1);
        expect(setNormalizedPose).toHaveBeenCalledWith(toVrmPose(finalPose));
    });

    it("does not promote stale finalPose when the current dry-run frame is unavailable", () => {
        const { vrm, setNormalizedPose } = createVrmWithSetNormalizedPose();

        const result = applyFullNormalizedPoseApplication(vrm, {
            status: "missing_profile",
            warnings: ["avatar_motion_profile_missing"],
        });

        expect(result).toEqual({
            applied: false,
            unavailableReason: "full_normalized_pose_application_unavailable:missing_profile",
            warnings: ["full_normalized_pose_application_unavailable:missing_profile"],
        });
        expect(setNormalizedPose).not.toHaveBeenCalled();
    });

    it("keeps full application as the only upper-body writer when finalPose is unavailable", () => {
        const debugManager = createDebugManagerDouble();
        const debugSpy = vi
            .spyOn(DebugConsoleManager, "getManager")
            .mockReturnValue(debugManager as unknown as DebugConsoleManager);
        const snapshot = createBehaviorSnapshot();
        const armUpdate = vi.fn();
        const motionUpdate = vi.fn();
        const rootStabilization = vi.fn();
        const { manager, setNormalizedPose } = createUpdateManagerDouble({
            snapshot,
            dryRun: { status: "invalid_input", warnings: ["delta_seconds_invalid"] },
            armUpdate,
            motionUpdate,
            rootStabilization,
        });

        try {
            manager.update(1000);
        } finally {
            debugSpy.mockRestore();
        }

        expect(setNormalizedPose).not.toHaveBeenCalled();
        expect(armUpdate).not.toHaveBeenCalled();
        expect(motionUpdate).not.toHaveBeenCalled();
        expect(rootStabilization).toHaveBeenCalledTimes(1);
        expect(manager.legBoneController.update).toHaveBeenCalledTimes(1);
        expect(manager.vrm.update).toHaveBeenCalledTimes(1);
        expect(debugManager.updateSincroComposerDryRunSummary).toHaveBeenLastCalledWith(
            expect.objectContaining({
                warnings: [
                    "delta_seconds_invalid",
                    "full_normalized_pose_application_unavailable:invalid_input",
                ],
                fullNormalizedPoseApplication: {
                    applied: false,
                    unavailableReason: "full_normalized_pose_application_unavailable:invalid_input",
                },
            }),
        );
    });

    it("keeps head, face, eye, mouth, emotion, leg, vrm update, and root updates on available frames", () => {
        const debugManager = createDebugManagerDouble();
        const debugSpy = vi
            .spyOn(DebugConsoleManager, "getManager")
            .mockReturnValue(debugManager as unknown as DebugConsoleManager);
        const snapshot = createBehaviorSnapshot();
        const finalPose = { leftUpperArm: eulerQuaternion(0.8, 0.1, 0) };
        const rootStabilization = vi.fn();
        const { manager, setNormalizedPose } = createUpdateManagerDouble({
            snapshot,
            dryRun: createAvailableDryRun(finalPose),
            armUpdate: vi.fn(),
            motionUpdate: vi.fn(),
            rootStabilization,
        });

        try {
            manager.update(1000);
        } finally {
            debugSpy.mockRestore();
        }

        expect(setNormalizedPose).toHaveBeenCalledWith(toVrmPose(finalPose));
        expect(manager.headBoneController.update).toHaveBeenCalledTimes(1);
        expect(manager.eyeBehaviorController.update).toHaveBeenCalledTimes(1);
        expect(manager.mouthMorphController.update).toHaveBeenCalledTimes(1);
        expect(manager.emotionMorphController.update).toHaveBeenCalledTimes(1);
        expect(manager.legBoneController.update).toHaveBeenCalledTimes(1);
        expect(manager.vrm.update).toHaveBeenCalledTimes(1);
        expect(rootStabilization).toHaveBeenCalledTimes(1);
        expect(debugManager.updateSincroComposerDryRunSummary).toHaveBeenLastCalledWith(
            expect.objectContaining({
                fullNormalizedPoseApplication: {
                    applied: true,
                    unavailableReason: undefined,
                },
            }),
        );
    });
});

describe("VRMCharacterManager semantic/finger rollback lifecycle", () => {
    it("resets production dry-run previous final pose when semantic finger mode changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as SemanticFingerModeManagerTestDouble;
        Object.assign(manager, {
            composerSemanticFingerApplicationMode: "composer",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ composerSemanticFingerApplicationMode: "off" });

        expect(reset).toHaveBeenCalledTimes(1);
        expect(manager.composerSemanticFingerApplicationMode).toBe("off");
        expect(setConfig).toHaveBeenCalledWith({ composerSemanticFingerApplicationMode: "off" });
    });

    it("keeps dry-run previous final pose when unrelated retarget config changes", () => {
        const reset = vi.fn();
        const setConfig = vi.fn();
        const manager = Object.create(
            VRMCharacterManager.prototype,
        ) as SemanticFingerModeManagerTestDouble;
        Object.assign(manager, {
            composerSemanticFingerApplicationMode: "composer",
            composerDryRun: { reset },
            sincroPoseRetargeter: { setConfig },
        });

        manager.setSincroPoseRetargetConfig({ intensityScale: 0.5 });

        expect(reset).not.toHaveBeenCalled();
        expect(manager.composerSemanticFingerApplicationMode).toBe("composer");
        expect(setConfig).toHaveBeenCalledWith({ intensityScale: 0.5 });
    });
});

type SemanticFingerModeManagerTestDouble = {
    setSincroPoseRetargetConfig: VRMCharacterManager["setSincroPoseRetargetConfig"];
    composerSemanticFingerApplicationMode: "off" | "composer";
    composerDryRun: { reset: () => void };
    sincroPoseRetargeter: { setConfig: (config: unknown) => void };
};

type UpdateManagerTestDouble = VRMCharacterManager & {
    headBoneController: { update: ReturnType<typeof vi.fn> };
    eyeBehaviorController: { update: ReturnType<typeof vi.fn> };
    mouthMorphController: { update: ReturnType<typeof vi.fn> };
    emotionMorphController: { update: ReturnType<typeof vi.fn> };
    legBoneController: { update: ReturnType<typeof vi.fn> };
    vrm: {
        update: ReturnType<typeof vi.fn>;
        humanoid: { setNormalizedPose: ReturnType<typeof vi.fn> };
    };
};

function createController(): {
    controller: ArmBoneController;
    nodes: Record<"leftUpperArm", Object3D>;
    setNormalizedPose: ReturnType<typeof vi.fn>;
} {
    const nodes = {
        leftUpperArm: new Object3D(),
        rightUpperArm: new Object3D(),
        leftLowerArm: new Object3D(),
        rightLowerArm: new Object3D(),
        leftHand: new Object3D(),
        leftThumbProximal: new Object3D(),
        rightHand: new Object3D(),
        rightThumbProximal: new Object3D(),
    };
    const setNormalizedPose = vi.fn();
    const vrm = {
        humanoid: {
            getNormalizedBoneNode: (name: VRMHumanBoneName) => nodes[name as keyof typeof nodes],
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
    rootStabilization: ReturnType<typeof vi.fn>;
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
        composerSemanticFingerApplicationMode: "composer",
        sincroMotionPipelineState: createDefaultSincroMotionPipelineState(),
        headBoneController: { update: vi.fn() },
        eyeBehaviorController: { update: vi.fn() },
        mouthMorphController: { update: vi.fn() },
        emotionMorphController: { update: vi.fn() },
        armBoneController: { update: options.armUpdate },
        legBoneController: { update: vi.fn() },
        motionOrchestrator: {
            update: options.motionUpdate,
            updateRootStabilization: options.rootStabilization,
        },
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
        pose[bone] =
            quaternion === undefined
                ? { rotation: [0, 0, 0, 1] }
                : { rotation: [quaternion.x, quaternion.y, quaternion.z, quaternion.w] };
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
