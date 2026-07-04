import type { VRMHumanBoneName } from "@pixiv/three-vrm";
import { describe, expect, it } from "vitest";
import { NEUTRAL_POSE_FRAME } from "../../retargeting/sincroPoseRetargetTypes";
import type { SincroVrmPoseComposerDryRunResult } from "../../runtime/sincroVrmPoseComposerDryRun";
import type { VrmPoseQuaternion } from "../../vrmPose/vrmPoseTypes";
import type { SincroMotionDebugFrame } from "../motionDebugLogSchema";
import {
    type ComposerComparisonMetricFrameInput,
    type ComposerComparisonSummaryConfig,
    calculateComposerComparisonMetrics,
    calculateComposerComparisonSummary,
    createComposerComparisonUnavailableSummary,
    parseComposerComparisonFrameInput,
} from "../motionMetrics";

const GENERATED_AT_ISO = "2026-06-29T12:00:00.000Z";

function createRetargetFrame(): typeof NEUTRAL_POSE_FRAME {
    const frame = structuredClone(NEUTRAL_POSE_FRAME);
    frame.active = true;
    frame.confidence = 0.9;
    frame.ikMode = "world_3d_ik";
    frame.leftArm.upperArmQuaternion = zRotation(10);
    frame.leftArm.lowerArmQuaternion = zRotation(20);
    frame.rightArm.upperArmQuaternion = zRotation(30);
    frame.rightArm.lowerArmQuaternion = zRotation(40);
    return frame;
}

function createComposerDryRun(options?: {
    leftUpperArmDeg?: number;
    rightLowerArmDeg?: number;
    angularVelocityBones?: VRMHumanBoneName[];
    ownedBoneWarnings?: string[];
    suppressedLayerCount?: number;
}): SincroVrmPoseComposerDryRunResult {
    return {
        status: "available",
        result: {
            finalPose: {
                leftUpperArm: zRotation(options?.leftUpperArmDeg ?? 12),
                leftLowerArm: zRotation(21),
                rightUpperArm: zRotation(32),
                rightLowerArm: zRotation(options?.rightLowerArmDeg ?? 44),
            },
            ownedBones: ["leftUpperArm", "leftLowerArm", "rightUpperArm", "rightLowerArm"],
            suppressedLayers: Array.from(
                { length: options?.suppressedLayerCount ?? 0 },
                (_, index) => ({
                    id: `suppressed:${index}`,
                    kind: "tracking",
                    bone: "leftUpperArm",
                    reason: "tracking_owns_bone",
                }),
            ),
            clampedBones: (options?.angularVelocityBones ?? []).map((bone) => ({
                bone,
                reason: "angular_velocity",
                after: zRotation(0),
            })),
            warnings: options?.ownedBoneWarnings ?? [],
        },
        warnings: [],
    };
}

function createFrame(options?: {
    solver?: unknown;
    finalPose?: unknown;
    mediaTimeMs?: number;
}): SincroMotionDebugFrame {
    return {
        frameIndex: 0,
        timestamp: { mediaTimeMs: options?.mediaTimeMs ?? 0 },
        video: { width: 1280, height: 720 },
        solver: options?.solver,
        finalPose: options?.finalPose,
    };
}

function createRuntimeSnapshot(frame: typeof NEUTRAL_POSE_FRAME): unknown {
    return {
        active: frame.active,
        confidence: frame.confidence,
        ikMode: frame.ikMode,
        fallbackReason: frame.fallbackReason,
        solverProbe: frame.solverProbe,
        anchor: frame.anchor,
        leftArm: frame.leftArm,
        rightArm: frame.rightArm,
    };
}

function createDryRunResultSnapshot(dryRun: SincroVrmPoseComposerDryRunResult): unknown {
    return structuredClone(dryRun);
}

function createLegacyFinalPoseSnapshot(dryRun: SincroVrmPoseComposerDryRunResult): unknown {
    if (dryRun.result === undefined) {
        throw new Error("Test dry-run result should be available.");
    }
    return {
        schemaVersion: "sincro.vrm-pose-composer-result.v1",
        ...dryRun.result,
    };
}

function createSummaryConfig(
    baselineSource: ComposerComparisonSummaryConfig["baselineSource"] = "captured",
): ComposerComparisonSummaryConfig {
    return {
        fixtureId: "neutral-10s",
        baselineSource,
        generatedAtIso: GENERATED_AT_ISO,
        inputs: {
            baselineManifestPath:
                "tasks/character-sincro-motion/task-260629225919-production-sincro-motion-replay-baselines/artifacts/production-sincro-baseline-manifest.md",
            replayLog: {
                available: baselineSource !== "not-captured",
                path:
                    baselineSource === "not-captured"
                        ? undefined
                        : "artifacts/replay/neutral-10s.ndjson",
            },
            composerDryRunResult: {
                available: baselineSource !== "not-captured",
                source: baselineSource === "not-captured" ? undefined : "frame.finalPose",
            },
        },
    };
}

function zRotation(deg: number): VrmPoseQuaternion {
    const rad = (deg * Math.PI) / 180;
    return {
        x: 0,
        y: 0,
        z: Math.sin(rad / 2),
        w: Math.cos(rad / 2),
    };
}

describe("calculateComposerComparisonMetrics", () => {
    it("compares retarget arm quaternions with composer final pose and counts composer diagnostics", () => {
        const result = calculateComposerComparisonMetrics({
            mediaTimeMs: 100,
            retarget: createRetargetFrame(),
            composerDryRun: createComposerDryRun({
                rightLowerArmDeg: 46,
                angularVelocityBones: ["leftUpperArm", "leftUpperArm", "rightLowerArm"],
                ownedBoneWarnings: [
                    "owned_bone_conflict:leftUpperArm",
                    "owned_bone_conflict:leftUpperArm",
                    "owned_bone_conflict:rightLowerArm",
                    "unsupported_bone:hips",
                ],
                suppressedLayerCount: 3,
            }),
        });

        expect(result.status).toBe("available");
        expect(result.comparedBoneCount).toBe(4);
        expect(result.values.composerAngleDeltaDeg).toBeCloseTo(6);
        expect(result.values.composerAngularVelocitySpike).toBe(2);
        expect(result.values.composerOwnedBoneConflictCount).toBe(2);
        expect(result.values.composerSuppressionCount).toBe(3);
        expect(result.values.composerMissingPoseFrameCount).toBe(0);
    });

    it("marks missing retarget or unavailable dry-run frames without fabricating angle delta", () => {
        const result = calculateComposerComparisonMetrics({
            mediaTimeMs: 100,
            composerDryRun: { status: "not_ready", warnings: ["retarget_frame_not_ready"] },
        });

        expect(result).toMatchObject({
            status: "not_available",
            unavailableReason: "retarget_or_composer_not_recorded",
            comparedBoneCount: 0,
            values: {
                composerAngleDeltaDeg: 0,
                composerMissingPoseFrameCount: 1,
            },
        });
    });
});

describe("parseComposerComparisonFrameInput", () => {
    it("reads frame.solver.poseRetargetRuntime and does not fallback to the old poseRetarget slot", () => {
        const retarget = createRetargetFrame();
        const parsed = parseComposerComparisonFrameInput(
            createFrame({
                solver: {
                    poseRetarget: createRuntimeSnapshot(retarget),
                    poseRetargetRuntime: createRuntimeSnapshot(retarget),
                },
                finalPose: createDryRunResultSnapshot(createComposerDryRun()),
                mediaTimeMs: 250,
            }),
        );

        expect(parsed.mediaTimeMs).toBe(250);
        expect(parsed.retarget?.upperBody).toEqual(NEUTRAL_POSE_FRAME.upperBody);
        expect(parsed.retarget?.leftArm.upperArmQuaternion).toEqual(
            retarget.leftArm.upperArmQuaternion,
        );
        expect(parsed.composerDryRun?.status).toBe("available");

        const oldSlotOnly = parseComposerComparisonFrameInput(
            createFrame({
                solver: { poseRetarget: createRuntimeSnapshot(retarget) },
                finalPose: createDryRunResultSnapshot(createComposerDryRun()),
            }),
        );
        expect(oldSlotOnly.retarget).toBeUndefined();
    });

    it("treats status-bearing production dry-run snapshots as composer input", () => {
        const retarget = createRetargetFrame();
        const parsed = parseComposerComparisonFrameInput(
            createFrame({
                solver: { poseRetargetRuntime: createRuntimeSnapshot(retarget) },
                finalPose: createDryRunResultSnapshot(createComposerDryRun()),
            }),
        );

        expect(parsed.composerDryRun?.status).toBe("available");
        expect(parsed.composerDryRun?.result?.finalPose.leftUpperArm).toEqual(zRotation(12));
    });

    it("does not treat legacy finalPose snapshots as production dry-run results", () => {
        const retarget = createRetargetFrame();
        const parsed = parseComposerComparisonFrameInput(
            createFrame({
                solver: { poseRetargetRuntime: createRuntimeSnapshot(retarget) },
                finalPose: createLegacyFinalPoseSnapshot(createComposerDryRun()),
            }),
        );

        expect(parsed.retarget).toBeDefined();
        expect(parsed.composerDryRun).toBeUndefined();

        const summary = calculateComposerComparisonSummary([parsed], createSummaryConfig());
        expect(summary).toMatchObject({
            status: "comparison_unavailable",
            severity: "warn",
            unavailableReason: "retarget_or_composer_not_recorded",
        });
        expect(summary.metrics.composerAngleDeltaDeg).toMatchObject({
            value: null,
            status: "not_available",
            severity: "warn",
            unavailableReason: "retarget_or_composer_not_recorded",
        });
    });
});

describe("calculateComposerComparisonSummary", () => {
    it("aggregates available frames with p95 angle and missing frame count severity", () => {
        const frames: ComposerComparisonMetricFrameInput[] = [
            {
                mediaTimeMs: 0,
                retarget: createRetargetFrame(),
                composerDryRun: createComposerDryRun({ rightLowerArmDeg: 46 }),
            },
            {
                mediaTimeMs: 33,
                retarget: createRetargetFrame(),
                composerDryRun: createComposerDryRun({
                    rightLowerArmDeg: 80,
                    suppressedLayerCount: 2,
                }),
            },
            {
                mediaTimeMs: 66,
                retarget: createRetargetFrame(),
                composerDryRun: { status: "not_ready", warnings: [] },
            },
        ];

        const summary = calculateComposerComparisonSummary(frames, createSummaryConfig());

        expect(summary.status).toBe("available");
        expect(summary.metrics.composerAngleDeltaDeg.value).toBeCloseTo(40);
        expect(summary.metrics.composerAngleDeltaDeg.status).toBe("fail");
        expect(summary.metrics.composerSuppressionCount.value).toBe(2);
        expect(summary.metrics.composerMissingPoseFrameCount.value).toBe(1);
        expect(summary.metrics.composerMissingPoseFrameCount.status).toBe("warn");
        expect(summary.severity).toBe("fail");
    });

    it("keeps captured logs with no comparable frames as comparison_unavailable warn", () => {
        const summary = calculateComposerComparisonSummary(
            [{ mediaTimeMs: 0 }],
            createSummaryConfig("captured"),
        );

        expect(summary).toMatchObject({
            status: "comparison_unavailable",
            severity: "warn",
            unavailableReason: "retarget_or_composer_not_recorded",
        });
        expect(summary.metrics.composerAngleDeltaDeg.status).toBe("not_available");
        expect(summary.metrics.composerAngleDeltaDeg.severity).toBe("warn");
    });

    it("keeps not-captured baseline summaries unavailable and warn without synthetic angle delta", () => {
        const summary = createComposerComparisonUnavailableSummary(
            createSummaryConfig("not-captured"),
            "baseline_not_captured",
            ["Baseline source is not-captured; angle delta was not synthesized."],
        );

        expect(summary).toMatchObject({
            status: "comparison_unavailable",
            severity: "warn",
            unavailableReason: "baseline_not_captured",
        });
        expect(Object.values(summary.metrics)).toHaveLength(5);
        for (const metric of Object.values(summary.metrics)) {
            expect(metric).toMatchObject({
                value: null,
                status: "not_available",
                severity: "warn",
                unavailableReason: "baseline_not_captured",
            });
        }
    });
});
