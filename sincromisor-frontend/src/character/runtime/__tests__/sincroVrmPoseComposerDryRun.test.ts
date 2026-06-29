import { describe, expect, it } from "vitest";
import { NEUTRAL_POSE_FRAME } from "../../retargeting/sincroPoseRetargetTypes";
import {
    COMPLETE_PROFILE,
    eulerQuaternion,
} from "../../vrmPose/__tests__/vrmPoseComposerTestHelpers";
import { compose, SincroVrmPoseComposerDryRunService } from "../sincroVrmPoseComposerDryRun";

describe("SincroVrmPoseComposerDryRunService", () => {
    it("returns status without result when input is not ready", () => {
        const service = new SincroVrmPoseComposerDryRunService();

        expect(service.compose({ profile: COMPLETE_PROFILE }).result).toBeUndefined();
        expect(service.compose({ profile: COMPLETE_PROFILE }).status).toBe("not_ready");
        expect(service.compose({ frame: createActiveFrame() }).status).toBe("missing_profile");
        expect(
            service.compose({
                frame: createActiveFrame(),
                profile: COMPLETE_PROFILE,
                deltaSeconds: -1,
            }),
        ).toEqual({
            status: "invalid_input",
            warnings: ["delta_seconds_invalid"],
        });
    });

    it("composes only fallback and tracking layers for production dry-run", () => {
        const service = new SincroVrmPoseComposerDryRunService();
        const result = compose(service, {
            frame: createActiveFrame(),
            profile: COMPLETE_PROFILE,
            deltaSeconds: 1 / 60,
        });

        expect(result.status).toBe("available");
        expect(result.result?.ownedBones).toContain("leftUpperArm");
        expect(result.result?.ownedBones).toContain("spine");
        expect(result.result?.suppressedLayers.every((layer) => layer.kind !== "semantic")).toBe(
            true,
        );
        expect(result.result?.suppressedLayers.every((layer) => layer.id !== "finger")).toBe(true);
    });

    it("keeps missing optional bone fallback visible in the dry-run result", () => {
        const service = new SincroVrmPoseComposerDryRunService();
        const profile = {
            ...COMPLETE_PROFILE,
            optionalBones: {
                ...COMPLETE_PROFILE.optionalBones,
                upperChest: false,
                leftShoulder: false,
            },
            warnings: ["missing_left_shoulder"],
        };

        const result = service.compose({
            frame: createActiveFrame(),
            profile,
            deltaSeconds: 1 / 60,
        });

        expect(result.status).toBe("available");
        expect(result.warnings).toContain("missing_left_shoulder");
        expect(result.result?.suppressedLayers).toContainEqual({
            id: "production:fallback",
            kind: "fallback",
            bone: "upperChest",
            reason: "missing_optional_bone",
        });
        expect(result.result?.suppressedLayers).toContainEqual({
            id: "production:fallback",
            kind: "fallback",
            bone: "leftShoulder",
            reason: "missing_optional_bone",
        });
    });

    it("uses previous available final pose only for angular velocity clamp", () => {
        const service = new SincroVrmPoseComposerDryRunService();
        service.compose({
            frame: createActiveFrame(0),
            profile: COMPLETE_PROFILE,
            deltaSeconds: 1 / 60,
        });

        const result = service.compose({
            frame: createActiveFrame(Math.PI),
            profile: COMPLETE_PROFILE,
            deltaSeconds: 1 / 60,
        });

        expect(result.status).toBe("available");
        expect(result.result?.clampedBones).toContainEqual(
            expect.objectContaining({
                bone: "leftUpperArm",
                reason: "angular_velocity",
            }),
        );
    });

    it("does not update previous final pose on invalid input", () => {
        const service = new SincroVrmPoseComposerDryRunService();
        service.compose({
            frame: createActiveFrame(0),
            profile: COMPLETE_PROFILE,
            deltaSeconds: 1 / 60,
        });
        service.compose({
            frame: createActiveFrame(Math.PI),
            profile: COMPLETE_PROFILE,
            deltaSeconds: -1,
        });

        const result = service.compose({
            frame: createActiveFrame(Math.PI),
            profile: COMPLETE_PROFILE,
            deltaSeconds: 1 / 60,
        });

        expect(result.result?.clampedBones).toContainEqual(
            expect.objectContaining({
                bone: "leftUpperArm",
                reason: "angular_velocity",
            }),
        );
    });
});

function createActiveFrame(leftUpperArmX = 0.4): typeof NEUTRAL_POSE_FRAME {
    const frame = structuredClone(NEUTRAL_POSE_FRAME);
    frame.active = true;
    frame.confidence = 0.9;
    frame.ikMode = "feature_only";
    frame.fallbackReason = undefined;
    frame.upperBody.spine = { x: 0.02, y: 0, z: 0 };
    frame.upperBody.chest = { x: 0.04, y: 0, z: 0 };
    frame.leftArm.active = true;
    frame.leftArm.ikActive = true;
    frame.leftArm.ikWeight = 1;
    frame.leftArm.fallbackReason = undefined;
    frame.leftArm.upperArmQuaternion = eulerQuaternion(leftUpperArmX, 0, 0);
    frame.leftArm.lowerArmQuaternion = eulerQuaternion(0.2, 0, 0);
    frame.rightArm.active = true;
    frame.rightArm.ikActive = true;
    frame.rightArm.ikWeight = 1;
    frame.rightArm.fallbackReason = undefined;
    frame.rightArm.upperArmQuaternion = eulerQuaternion(0.3, 0, 0);
    frame.rightArm.lowerArmQuaternion = eulerQuaternion(0.15, 0, 0);
    return frame;
}
