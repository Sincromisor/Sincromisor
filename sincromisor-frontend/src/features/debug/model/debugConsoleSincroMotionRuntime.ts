import {
    cloneMinimalAvatarMotionProfile,
    type MinimalAvatarMotionProfile,
} from "../../../character/avatarProfile/minimalAvatarMotionProfile";
import type { SincroPoseRetargetFrame } from "../../../character/retargeting/sincroPoseRetargeter";
import type { SincroMotionObserveOnlySummary } from "../../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { SincroVrmPoseComposerResult } from "../../../character/runtime/sincroVrmPoseComposer";
import { createNeutralArmIkConstraint } from "./debugConsoleMotionSnapshot";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type PoseRetargetRuntimeSnapshot = DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];
type ObserveOnlySummarySnapshot = DebugConsoleSnapshot["sincroMotion"]["observeOnly"];

/**
 * observe-only summary を Debug Console snapshot 用に clone する。
 *
 * 常時表示するのは availability / reason / warning count の入口情報に限定し、
 * `SincroMotionPipelineState` 本体を React snapshot へ流して大きな JSON を再描画し続けない。
 */
export function cloneObserveOnlySummary(
    summary: SincroMotionObserveOnlySummary,
): ObserveOnlySummarySnapshot {
    return {
        reliability: cloneObserveOnlyStage(summary.reliability),
        canonical: cloneObserveOnlyStage(summary.canonical),
        temporal: cloneObserveOnlyStage(summary.temporal),
        intent: cloneObserveOnlyStage(summary.intent),
        hand: {
            status: summary.hand.status,
            mediaTimeMs: summary.hand.mediaTimeMs,
            reason: summary.hand.reason,
            trackingEnabled: summary.hand.trackingEnabled,
            detected: summary.hand.detected,
            left: { ...summary.hand.left },
            right: { ...summary.hand.right },
            warnings: [...summary.hand.warnings],
        },
        gesture: {
            status: summary.gesture.status,
            mediaTimeMs: summary.gesture.mediaTimeMs,
            reason: summary.gesture.reason,
            trackingEnabled: summary.gesture.trackingEnabled,
            inferenceFps: summary.gesture.inferenceFps,
            left: summary.gesture.left === undefined ? undefined : { ...summary.gesture.left },
            right: summary.gesture.right === undefined ? undefined : { ...summary.gesture.right },
            warnings: [...summary.gesture.warnings],
        },
        composerDryRun: {
            status: summary.composerDryRun.status,
            warnings: [...summary.composerDryRun.warnings],
            suppressedLayers: [...summary.composerDryRun.suppressedLayers],
            clampedBones: [...summary.composerDryRun.clampedBones],
            fullNormalizedPoseApplication:
                summary.composerDryRun.fullNormalizedPoseApplication === undefined
                    ? undefined
                    : { ...summary.composerDryRun.fullNormalizedPoseApplication },
        },
        updatedAtMs: summary.updatedAtMs,
    };
}

/** 動作変換と本番合成結果を診断用に複製する。既存の composerDryRun キーを保存・再生用に保つ。 */
export function clonePoseRetargetRuntime(
    frame: SincroPoseRetargetFrame,
    avatarMotionProfile?: MinimalAvatarMotionProfile,
    composerDryRun?: SincroVrmPoseComposerResult,
): PoseRetargetRuntimeSnapshot {
    return {
        active: frame.active,
        confidence: frame.confidence,
        ikMode: frame.ikMode,
        fallbackReason: frame.fallbackReason,
        solverProbe: {
            ccdik: frame.solverProbe.ccdik
                ? {
                      ...frame.solverProbe.ccdik,
                      notes: [...frame.solverProbe.ccdik.notes],
                  }
                : undefined,
        },
        anchor: {
            active: frame.anchor.active,
            weight: frame.anchor.weight,
            reason: frame.anchor.reason,
            shoulderOffset: { ...frame.anchor.shoulderOffset },
        },
        leftArm: clonePoseRetargetArmRuntime(frame.leftArm),
        rightArm: clonePoseRetargetArmRuntime(frame.rightArm),
        avatarMotionProfile: avatarMotionProfile
            ? cloneMinimalAvatarMotionProfile(avatarMotionProfile)
            : undefined,
        composerDryRun: cloneComposerDryRun(composerDryRun),
    };
}

/** 本番合成結果を診断側の変更から切り離す。結果欠損はそのまま保つ。 */
export function cloneComposerDryRun(
    result: SincroVrmPoseComposerResult | undefined,
): SincroVrmPoseComposerResult | undefined {
    return result === undefined ? undefined : structuredClone(result);
}

export function cloneAvatarMotionProfile(
    profile: MinimalAvatarMotionProfile | undefined,
): MinimalAvatarMotionProfile | undefined {
    return profile ? cloneMinimalAvatarMotionProfile(profile) : undefined;
}

function clonePoseRetargetArmRuntime(
    arm: SincroPoseRetargetFrame["leftArm"],
): PoseRetargetRuntimeSnapshot["leftArm"] {
    return {
        ...arm,
        constraint: {
            ...arm.constraint,
            reasons: [...arm.constraint.reasons],
        },
        upperArm: { ...arm.upperArm },
        lowerArm: { ...arm.lowerArm },
        wrist: { ...arm.wrist },
    };
}

function cloneObserveOnlyStage(
    stage: SincroMotionObserveOnlySummary["reliability"],
): ObserveOnlySummarySnapshot["reliability"] {
    return {
        status: stage.status,
        mediaTimeMs: stage.mediaTimeMs,
        reason: stage.reason,
        warnings: [...stage.warnings],
    };
}

/** 診断用の姿勢適用結果は未開始・中立から表示し、設定モデルの正本とは分離する。 */
export function createDefaultPoseRetargetRuntimeSnapshot(): PoseRetargetRuntimeSnapshot {
    return {
        active: false,
        confidence: 0,
        ikMode: "fallback",
        fallbackReason: "neutral",
        solverProbe: {},
        anchor: {
            active: false,
            weight: 0,
            reason: "neutral",
            shoulderOffset: { x: 0, y: 0 },
        },
        leftArm: createDefaultPoseRetargetArmRuntimeSnapshot(),
        rightArm: createDefaultPoseRetargetArmRuntimeSnapshot(),
        avatarMotionProfile: undefined,
    };
}

function createDefaultPoseRetargetArmRuntimeSnapshot(): PoseRetargetRuntimeSnapshot["leftArm"] {
    return {
        active: false,
        ikActive: false,
        ikWeight: 0,
        fallbackReason: "neutral",
        ikSolverMode: "none",
        constraint: createNeutralArmIkConstraint(),
        upperArm: { x: 0, y: 0, z: 0 },
        lowerArm: { x: 0, y: 0, z: 0 },
        wrist: { x: 0, y: 0, z: 0 },
        upperArmQuaternion: undefined,
        lowerArmQuaternion: undefined,
    };
}
