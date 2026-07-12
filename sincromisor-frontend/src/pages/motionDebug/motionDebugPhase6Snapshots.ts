/**
 * live runtime から Phase 6 solver / final pose debug snapshot を作る bridge。
 * IK solver や composer を再構成せず、既存 runtime snapshot と avatar profile から保存可能な debug layer を生成する。
 */
import {
    createMotionDebugFinalPoseSnapshot,
    createMotionDebugPhase6SolverSnapshot,
    type MotionDebugFinalPoseSnapshot,
    type MotionDebugPhase6SolverSnapshot,
} from "../../character/motionEvaluation/motionDebugPhase6Snapshot";
import { composeVrmPose } from "../../character/vrmPose/vrmPoseComposer";
import type {
    VrmNormalizedLocalPose,
    VrmPoseComposerResult,
} from "../../character/vrmPose/vrmPoseTypes";
import type { DebugConsoleSnapshot } from "../../features/debug/model/debugConsoleManager";

type PoseRetargetRuntimeSnapshot = DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];

export function createMotionDebugLivePhase6SolverSnapshot(
    runtime: PoseRetargetRuntimeSnapshot,
): MotionDebugPhase6SolverSnapshot | undefined {
    return createMotionDebugPhase6SolverSnapshot({
        profile: runtime.avatarMotionProfile,
        leftArm: runtime.leftArm,
        rightArm: runtime.rightArm,
    });
}

export function createMotionDebugLiveFinalPoseSnapshot(
    runtime: PoseRetargetRuntimeSnapshot,
): MotionDebugFinalPoseSnapshot | undefined {
    if (runtime.composerDryRun?.status === "available" && runtime.composerDryRun.result) {
        return createMotionDebugFinalPoseSnapshot(runtime.composerDryRun.result);
    }
    const profile = runtime.avatarMotionProfile;
    if (profile === undefined) {
        return undefined;
    }
    return createMotionDebugFinalPoseSnapshot(composeDebugFinalPose(runtime, profile));
}

function composeDebugFinalPose(
    runtime: PoseRetargetRuntimeSnapshot,
    profile: NonNullable<PoseRetargetRuntimeSnapshot["avatarMotionProfile"]>,
): VrmPoseComposerResult {
    const pose: VrmNormalizedLocalPose = {};
    if (runtime.leftArm.upperArmQuaternion !== undefined) {
        pose.leftUpperArm = runtime.leftArm.upperArmQuaternion;
    }
    if (runtime.leftArm.lowerArmQuaternion !== undefined) {
        pose.leftLowerArm = runtime.leftArm.lowerArmQuaternion;
    }
    if (runtime.rightArm.upperArmQuaternion !== undefined) {
        pose.rightUpperArm = runtime.rightArm.upperArmQuaternion;
    }
    if (runtime.rightArm.lowerArmQuaternion !== undefined) {
        pose.rightLowerArm = runtime.rightArm.lowerArmQuaternion;
    }
    return composeVrmPose({
        layers: [
            {
                id: "motion-debug-tracking",
                kind: "tracking",
                blendMode: "override",
                weight: 1,
                pose,
                ownedBones: ["leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm"],
            },
        ],
        profile,
    });
}
