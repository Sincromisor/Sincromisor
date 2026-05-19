import type {
    SincroPoseRetargetConfig,
    SincroPoseRetargetFrame,
} from "../../../character/retargeting/sincroPoseRetargeter";
import type { DebugConsoleSnapshot } from "./debugConsoleSnapshot";

type PoseRetargetConfigSnapshot = DebugConsoleSnapshot["sincroMotion"]["poseRetarget"];
type PoseRetargetRuntimeSnapshot = DebugConsoleSnapshot["sincroMotion"]["poseRetargetRuntime"];

export function clonePoseRetargetRuntime(
    frame: SincroPoseRetargetFrame,
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
    };
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

function clampNumber(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}
