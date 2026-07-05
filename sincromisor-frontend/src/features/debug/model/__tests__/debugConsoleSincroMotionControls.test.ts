import { describe, expect, it } from "vitest";
import { DebugConsoleSincroMotionControls } from "../debugConsoleSincroMotionControls";
import { createDefaultSnapshot, type DebugConsoleSnapshot } from "../debugConsoleSnapshot";

describe("DebugConsoleSincroMotionControls", () => {
    it("initializes full normalized pose mode with the production default", () => {
        const snapshot = createDefaultSnapshot();

        expect(snapshot.sincroMotion.poseRetarget.fullNormalizedPoseApplicationMode).toBe(
            "upper_body",
        );
    });

    it("updates composer dry-run summary without replacing observe-only tracker stages", () => {
        let snapshot = createDefaultSnapshot();
        snapshot = {
            ...snapshot,
            sincroMotion: {
                ...snapshot.sincroMotion,
                observeOnly: {
                    ...snapshot.sincroMotion.observeOnly,
                    reliability: {
                        status: "available",
                        mediaTimeMs: 120,
                        warnings: ["low_confidence"],
                    },
                },
            },
        };
        const controls = new DebugConsoleSincroMotionControls({
            readSnapshot: () => snapshot,
            updateSnapshot: (updater: (current: DebugConsoleSnapshot) => DebugConsoleSnapshot) => {
                snapshot = updater(snapshot);
            },
        });

        controls.updateSincroComposerDryRunSummary({
            status: "available",
            warnings: ["owned_bone_conflict:leftUpperArm"],
            suppressedLayers: ["production:fallback:fallback:upperChest:missing_optional_bone"],
            clampedBones: ["leftUpperArm:angular_velocity"],
            fullNormalizedPoseApplication: {
                mode: "upper_body",
                applied: false,
                rollbackReason: "full_normalized_pose_application_result_missing",
            },
        });

        expect(snapshot.sincroMotion.observeOnly.reliability.status).toBe("available");
        expect(snapshot.sincroMotion.observeOnly.composerDryRun).toEqual({
            status: "available",
            warnings: ["owned_bone_conflict:leftUpperArm"],
            suppressedLayers: ["production:fallback:fallback:upperChest:missing_optional_bone"],
            clampedBones: ["leftUpperArm:angular_velocity"],
            fullNormalizedPoseApplication: {
                mode: "upper_body",
                applied: false,
                rollbackReason: "full_normalized_pose_application_result_missing",
            },
        });
    });

    it("applies composer arm application mode through the pose retarget config path", () => {
        let snapshot = createDefaultSnapshot();
        const controls = new DebugConsoleSincroMotionControls({
            readSnapshot: () => snapshot,
            updateSnapshot: (updater: (current: DebugConsoleSnapshot) => DebugConsoleSnapshot) => {
                snapshot = updater(snapshot);
            },
        });

        controls.applySincroPoseRetargetConfig({ composerArmApplicationMode: "both" });

        expect(snapshot.sincroMotion.poseRetarget.composerArmApplicationMode).toBe("both");
    });

    it("applies torso and shoulder composer mode separately from arm mode", () => {
        let snapshot = createDefaultSnapshot();
        const controls = new DebugConsoleSincroMotionControls({
            readSnapshot: () => snapshot,
            updateSnapshot: (updater: (current: DebugConsoleSnapshot) => DebugConsoleSnapshot) => {
                snapshot = updater(snapshot);
            },
        });

        controls.applySincroPoseRetargetConfig({
            composerTorsoShoulderApplicationMode: "composer",
        });

        expect(snapshot.sincroMotion.poseRetarget.composerArmApplicationMode).toBe("off");
        expect(snapshot.sincroMotion.poseRetarget.composerTorsoShoulderApplicationMode).toBe(
            "composer",
        );
    });

    it("applies semantic finger composer mode separately from arm and torso modes", () => {
        let snapshot = createDefaultSnapshot();
        const controls = new DebugConsoleSincroMotionControls({
            readSnapshot: () => snapshot,
            updateSnapshot: (updater: (current: DebugConsoleSnapshot) => DebugConsoleSnapshot) => {
                snapshot = updater(snapshot);
            },
        });

        controls.applySincroPoseRetargetConfig({
            composerSemanticFingerApplicationMode: "off",
        });

        expect(snapshot.sincroMotion.poseRetarget.composerArmApplicationMode).toBe("off");
        expect(snapshot.sincroMotion.poseRetarget.composerTorsoShoulderApplicationMode).toBe(
            "direct",
        );
        expect(snapshot.sincroMotion.poseRetarget.composerSemanticFingerApplicationMode).toBe(
            "off",
        );
    });

    it("applies full normalized pose mode separately from staged composer modes", () => {
        let snapshot = createDefaultSnapshot();
        const controls = new DebugConsoleSincroMotionControls({
            readSnapshot: () => snapshot,
            updateSnapshot: (updater: (current: DebugConsoleSnapshot) => DebugConsoleSnapshot) => {
                snapshot = updater(snapshot);
            },
        });

        controls.applySincroPoseRetargetConfig({
            fullNormalizedPoseApplicationMode: "upper_body",
        });

        expect(snapshot.sincroMotion.poseRetarget.composerArmApplicationMode).toBe("off");
        expect(snapshot.sincroMotion.poseRetarget.composerTorsoShoulderApplicationMode).toBe(
            "direct",
        );
        expect(snapshot.sincroMotion.poseRetarget.composerSemanticFingerApplicationMode).toBe(
            "composer",
        );
        expect(snapshot.sincroMotion.poseRetarget.fullNormalizedPoseApplicationMode).toBe(
            "upper_body",
        );
    });
});
