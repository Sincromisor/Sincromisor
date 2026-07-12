import { describe, expect, it } from "vitest";
import { DebugConsoleSincroMotionControls } from "../debugConsoleSincroMotionControls";
import { createDefaultSnapshot, type DebugConsoleSnapshot } from "../debugConsoleSnapshot";

describe("DebugConsoleSincroMotionControls", () => {
    it("initializes semantic/finger composer mode with the production default", () => {
        const snapshot = createDefaultSnapshot();

        expect(snapshot.sincroMotion.poseRetarget.composerSemanticFingerApplicationMode).toBe(
            "composer",
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
                applied: false,
                unavailableReason: "full_normalized_pose_application_result_missing",
            },
        });

        expect(snapshot.sincroMotion.observeOnly.reliability.status).toBe("available");
        expect(snapshot.sincroMotion.observeOnly.composerDryRun).toEqual({
            status: "available",
            warnings: ["owned_bone_conflict:leftUpperArm"],
            suppressedLayers: ["production:fallback:fallback:upperChest:missing_optional_bone"],
            clampedBones: ["leftUpperArm:angular_velocity"],
            fullNormalizedPoseApplication: {
                applied: false,
                unavailableReason: "full_normalized_pose_application_result_missing",
            },
        });
    });

    it("applies semantic finger composer mode through the pose retarget config path", () => {
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

        expect(snapshot.sincroMotion.poseRetarget.composerSemanticFingerApplicationMode).toBe(
            "off",
        );
    });
});
