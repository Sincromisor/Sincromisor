import {
    cloneMinimalAvatarMotionProfile,
    type MinimalAvatarMotionProfile,
} from "../../../character/avatarProfile/minimalAvatarMotionProfile";
import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../../../character/retargeting/sincroPoseRetargeter";
import type { SincroMotionObserveOnlySummary } from "../../../character/runtime/sincroMotionObserveOnlyPipeline";
import type { SincroVrmPoseComposerDryRunResult } from "../../../character/runtime/sincroVrmPoseComposerDryRun";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type PoseRetargetConfigSnapshot = DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
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

export function clonePoseRetargetRuntime(
    frame: SincroPoseRetargetFrame,
    avatarMotionProfile?: MinimalAvatarMotionProfile,
    composerDryRun?: SincroVrmPoseComposerDryRunResult,
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

export function cloneComposerDryRun(
    result: SincroVrmPoseComposerDryRunResult | undefined,
): SincroVrmPoseComposerDryRunResult | undefined {
    return result === undefined ? undefined : structuredClone(result);
}

export function cloneAvatarMotionProfile(
    profile: MinimalAvatarMotionProfile | undefined,
): MinimalAvatarMotionProfile | undefined {
    return profile ? cloneMinimalAvatarMotionProfile(profile) : undefined;
}

export function updatePoseRetargetConfig(
    current: PoseRetargetConfigSnapshot,
    config: Partial<SincroPoseRetargetConfig>,
): PoseRetargetConfigSnapshot {
    return {
        ...current,
        intensityScale: clampNumber(config.intensityScale ?? current.intensityScale, 0, 1.2),
        minConfidence: clampNumber(config.minConfidence ?? current.minConfidence, 0, 1),
        returnToNeutralMs: clampNumber(
            config.returnToNeutralMs ?? current.returnToNeutralMs,
            80,
            2000,
        ),
        smoothingMs: clampNumber(config.smoothingMs ?? current.smoothingMs, 40, 800),
        armIkStrength: clampNumber(config.armIkStrength ?? current.armIkStrength, 0, 1),
        armIkTargetScale: clampNumber(
            config.armIkTargetScale ?? current.armIkTargetScale,
            0.2,
            1.5,
        ),
        armIkMaxLiftRad: clampNumber(
            config.armIkMaxLiftRad ?? current.armIkMaxLiftRad,
            0,
            Math.PI / 2,
        ),
        armIkMaxOpenRad: clampNumber(
            config.armIkMaxOpenRad ?? current.armIkMaxOpenRad,
            0,
            Math.PI / 2,
        ),
        armIkMaxForearmFlexRad: clampNumber(
            config.armIkMaxForearmFlexRad ?? current.armIkMaxForearmFlexRad,
            0,
            Math.PI / 2,
        ),
        armIkMode: config.armIkMode ?? current.armIkMode,
        composerArmApplicationMode:
            config.composerArmApplicationMode ?? current.composerArmApplicationMode,
        composerTorsoShoulderApplicationMode:
            config.composerTorsoShoulderApplicationMode ??
            current.composerTorsoShoulderApplicationMode,
        composerSemanticFingerApplicationMode:
            config.composerSemanticFingerApplicationMode ??
            current.composerSemanticFingerApplicationMode,
        fullNormalizedPoseApplicationMode:
            config.fullNormalizedPoseApplicationMode ?? current.fullNormalizedPoseApplicationMode,
    };
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

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
