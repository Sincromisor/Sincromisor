import { describe, expect, it } from "vitest";
import {
    COMPLETE_PROFILE,
    eulerQuaternion,
} from "../../../character/vrmPose/__tests__/vrmPoseComposerTestHelpers";
import { createDefaultSnapshot } from "../../../features/debug/model/debugConsoleSnapshot";
import { createMotionDebugLiveFinalPoseSnapshot } from "../motionDebugPhase6Snapshots";

describe("motionDebugPhase6Snapshots", () => {
    it("uses the production composer dry-run result for live finalPose snapshots", () => {
        const runtime = createDefaultSnapshot().sincroMotion.poseRetargetRuntime;
        runtime.avatarMotionProfile = COMPLETE_PROFILE;
        runtime.leftArm.upperArmQuaternion = eulerQuaternion(0.4, 0, 0);
        runtime.composerDryRun = {
            status: "available",
            warnings: [],
            result: {
                finalPose: {
                    leftIndexProximal: eulerQuaternion(0.7, 0, 0),
                },
                ownedBones: ["leftIndexProximal"],
                suppressedLayers: [],
                clampedBones: [],
                warnings: ["production_result_marker"],
            },
        };

        const snapshot = createMotionDebugLiveFinalPoseSnapshot(runtime);

        expect(snapshot?.ownedBones).toEqual(["leftIndexProximal"]);
        expect(snapshot?.warnings).toEqual(["production_result_marker"]);
        expect(snapshot?.finalPose.leftUpperArm).toBeUndefined();
    });
});
