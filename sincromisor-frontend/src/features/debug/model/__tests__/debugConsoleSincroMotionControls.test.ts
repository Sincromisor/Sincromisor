import { describe, expect, it } from "vitest";
import { DebugConsoleSincroMotionControls } from "../debugConsoleSincroMotionControls";
import { createDefaultSnapshot, type DebugConsoleSnapshot } from "../debugConsoleSnapshot";

describe("DebugConsoleSincroMotionControls", () => {
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
        });

        expect(snapshot.sincroMotion.observeOnly.reliability.status).toBe("available");
        expect(snapshot.sincroMotion.observeOnly.composerDryRun).toEqual({
            status: "available",
            warnings: ["owned_bone_conflict:leftUpperArm"],
            suppressedLayers: ["production:fallback:fallback:upperChest:missing_optional_bone"],
            clampedBones: ["leftUpperArm:angular_velocity"],
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
});
