import { MathUtils } from "three/src/math/MathUtils.js";
import { Quaternion } from "three/src/math/Quaternion.js";
import type { Vector3 } from "three/src/math/Vector3.js";
import type { SincroArmIkConstraintSnapshot } from "../ik/sincroArmIkConstraint";
import type { SincroArmIkQuaternion } from "../ik/sincroArmIkSolver";
import type { SincroArmIkTarget } from "../ik/sincroArmIkTypes";
import type { TemporalArmIkBridgeResult } from "../motionSolver/temporalArmSolverBridge";
import type { TemporalTuple3 } from "../temporal/temporalUpperBodyState";
import {
    NEUTRAL_ARM_IK_CONSTRAINT,
    type SincroPoseIkMode,
    type SincroPoseRetargetedArm,
    type SincroPoseRetargetFrame,
} from "./sincroPoseRetargetTypes";

export function positiveOnly(value: number): number {
    return Math.max(0, value);
}

export function smoothFrame(
    current: SincroPoseRetargetFrame,
    target: SincroPoseRetargetFrame,
    alpha: number,
): SincroPoseRetargetFrame {
    return {
        active: target.active,
        confidence: MathUtils.lerp(current.confidence, target.confidence, alpha),
        ikMode: target.ikMode,
        fallbackReason: target.fallbackReason,
        solverProbe: cloneSolverProbe(target.solverProbe),
        anchor: {
            active: target.anchor.active,
            weight: MathUtils.lerp(current.anchor.weight, target.anchor.weight, alpha),
            reason: target.anchor.reason,
            shoulderOffset: smoothVector2(
                current.anchor.shoulderOffset,
                target.anchor.shoulderOffset,
                alpha,
            ),
        },
        upperBody: {
            spine: smoothVector(current.upperBody.spine, target.upperBody.spine, alpha),
            chest: smoothVector(current.upperBody.chest, target.upperBody.chest, alpha),
            leftShoulder: smoothVector(
                current.upperBody.leftShoulder,
                target.upperBody.leftShoulder,
                alpha,
            ),
            rightShoulder: smoothVector(
                current.upperBody.rightShoulder,
                target.upperBody.rightShoulder,
                alpha,
            ),
        },
        leftArm: smoothArm(current.leftArm, target.leftArm, alpha),
        rightArm: smoothArm(current.rightArm, target.rightArm, alpha),
    };
}

export function blendArm(
    featureArm: SincroPoseRetargetedArm,
    ikArm: SincroPoseRetargetedArm,
    ikStrength: number,
): SincroPoseRetargetedArm {
    const alpha = MathUtils.clamp(ikStrength, 0, 1);
    return {
        active: featureArm.active || ikArm.active,
        ikActive: ikArm.ikActive,
        ikWeight: ikArm.ikWeight,
        ikSolverMode: ikArm.ikSolverMode,
        fallbackReason: ikArm.fallbackReason ?? featureArm.fallbackReason,
        solverSource: cloneArmSolverSource(ikArm.solverSource ?? featureArm.solverSource),
        temporalBridge: cloneTemporalBridge(ikArm.temporalBridge ?? featureArm.temporalBridge),
        reach: ikArm.reach ? { ...ikArm.reach } : undefined,
        constraint: cloneArmIkConstraint(ikArm.constraint),
        upperArm: smoothVector(featureArm.upperArm, ikArm.upperArm, alpha),
        lowerArm: smoothVector(featureArm.lowerArm, ikArm.lowerArm, alpha),
        wrist: smoothVector(featureArm.wrist, ikArm.wrist, alpha),
        upperArmQuaternion: ikArm.upperArmQuaternion,
        lowerArmQuaternion: ikArm.lowerArmQuaternion,
    };
}

export function blendQuaternion(
    from: SincroArmIkQuaternion,
    to: SincroArmIkQuaternion,
    alpha: number,
): SincroArmIkQuaternion {
    return serializeQuaternion(
        deserializeQuaternion(from)
            .slerp(deserializeQuaternion(to), MathUtils.clamp(alpha, 0, 1))
            .normalize(),
    );
}

export function cloneFrame(frame: SincroPoseRetargetFrame): SincroPoseRetargetFrame {
    return {
        active: frame.active,
        confidence: frame.confidence,
        ikMode: frame.ikMode,
        fallbackReason: frame.fallbackReason,
        solverProbe: cloneSolverProbe(frame.solverProbe),
        anchor: {
            active: frame.anchor.active,
            weight: frame.anchor.weight,
            reason: frame.anchor.reason,
            shoulderOffset: { ...frame.anchor.shoulderOffset },
        },
        upperBody: {
            spine: { ...frame.upperBody.spine },
            chest: { ...frame.upperBody.chest },
            leftShoulder: { ...frame.upperBody.leftShoulder },
            rightShoulder: { ...frame.upperBody.rightShoulder },
        },
        leftArm: cloneArm(frame.leftArm),
        rightArm: cloneArm(frame.rightArm),
    };
}

export function cloneArm(arm: SincroPoseRetargetedArm): SincroPoseRetargetedArm {
    return {
        active: arm.active,
        ikActive: arm.ikActive,
        ikWeight: arm.ikWeight,
        ikSolverMode: arm.ikSolverMode,
        fallbackReason: arm.fallbackReason,
        solverSource: cloneArmSolverSource(arm.solverSource),
        temporalBridge: cloneTemporalBridge(arm.temporalBridge),
        reach: arm.reach ? { ...arm.reach } : undefined,
        constraint: cloneArmIkConstraint(arm.constraint),
        upperArm: { ...arm.upperArm },
        lowerArm: { ...arm.lowerArm },
        wrist: { ...arm.wrist },
        upperArmQuaternion: arm.upperArmQuaternion ? { ...arm.upperArmQuaternion } : undefined,
        lowerArmQuaternion: arm.lowerArmQuaternion ? { ...arm.lowerArmQuaternion } : undefined,
    };
}

export function withFallbackReason(
    frame: SincroPoseRetargetFrame,
    fallbackReason: string,
): SincroPoseRetargetFrame {
    return {
        ...cloneFrame(frame),
        active: false,
        ikMode: "fallback",
        fallbackReason,
        anchor: {
            ...frame.anchor,
            active: false,
            reason: fallbackReason,
        },
        solverProbe: cloneSolverProbe(frame.solverProbe),
    };
}

export function cloneSolverProbe(
    solverProbe: SincroPoseRetargetFrame["solverProbe"],
): SincroPoseRetargetFrame["solverProbe"] {
    return {
        ccdik: solverProbe.ccdik
            ? {
                  ...solverProbe.ccdik,
                  notes: [...solverProbe.ccdik.notes],
              }
            : undefined,
    };
}

export function withSolverProbe(
    frame: SincroPoseRetargetFrame,
    solverProbe: SincroPoseRetargetFrame["solverProbe"],
): SincroPoseRetargetFrame {
    return {
        ...cloneFrame(frame),
        solverProbe: cloneSolverProbe(solverProbe),
    };
}

export function withArmFallbackReason(
    arm: SincroPoseRetargetedArm,
    fallbackReason: string,
): SincroPoseRetargetedArm {
    return {
        ...arm,
        active: false,
        ikActive: false,
        ikWeight: 0,
        ikSolverMode: "none",
        fallbackReason,
        constraint: cloneArmIkConstraint(NEUTRAL_ARM_IK_CONSTRAINT),
    };
}

export function cloneArmIkConstraint(
    constraint: SincroArmIkConstraintSnapshot,
): SincroArmIkConstraintSnapshot {
    return {
        ...constraint,
        reasons: [...constraint.reasons],
        reasonCodes: constraint.reasonCodes ? [...constraint.reasonCodes] : undefined,
    };
}

export function ikModeForArms(
    leftArm: SincroPoseRetargetedArm,
    rightArm: SincroPoseRetargetedArm,
): SincroPoseIkMode {
    if (leftArm.ikSolverMode === "world_3d_ik" || rightArm.ikSolverMode === "world_3d_ik") {
        return "world_3d_ik";
    }
    if (leftArm.ikSolverMode === "screen_space_ik" || rightArm.ikSolverMode === "screen_space_ik") {
        return "screen_space_ik";
    }
    if (leftArm.active || rightArm.active) {
        return "feature_only";
    }
    return "fallback";
}

function smoothArm(
    current: SincroPoseRetargetedArm,
    target: SincroPoseRetargetedArm,
    alpha: number,
): SincroPoseRetargetedArm {
    return {
        active: target.active,
        ikActive: target.ikActive,
        ikWeight: MathUtils.lerp(current.ikWeight, target.ikWeight, alpha),
        ikSolverMode: target.ikSolverMode,
        fallbackReason: target.fallbackReason,
        solverSource: cloneArmSolverSource(target.solverSource),
        temporalBridge: cloneTemporalBridge(target.temporalBridge),
        reach: target.reach ? { ...target.reach } : undefined,
        constraint: cloneArmIkConstraint(target.constraint),
        upperArm: smoothVector(current.upperArm, target.upperArm, alpha),
        lowerArm: smoothVector(current.lowerArm, target.lowerArm, alpha),
        wrist: smoothVector(current.wrist, target.wrist, alpha),
        upperArmQuaternion: smoothQuaternion(
            current.upperArmQuaternion,
            target.upperArmQuaternion,
            alpha,
        ),
        lowerArmQuaternion: smoothQuaternion(
            current.lowerArmQuaternion,
            target.lowerArmQuaternion,
            alpha,
        ),
    };
}

function cloneTemporalBridge(
    bridge: TemporalArmIkBridgeResult | undefined,
): TemporalArmIkBridgeResult | undefined {
    if (bridge === undefined) {
        return undefined;
    }
    return {
        target: cloneArmIkTarget(bridge.target),
        reasonCodes: [...bridge.reasonCodes],
        scale: { ...bridge.scale },
        sourceState: bridge.sourceState,
        debug: {
            ...bridge.debug,
            shoulderLocal: [...bridge.debug.shoulderLocal],
            wristBeforeClamp: cloneTuple(bridge.debug.wristBeforeClamp),
            wristAfterClamp: cloneTuple(bridge.debug.wristAfterClamp),
            elbowPoleBeforeNormalize: cloneTuple(bridge.debug.elbowPoleBeforeNormalize),
        },
    };
}

function cloneArmIkTarget(target: SincroArmIkTarget | undefined): SincroArmIkTarget | undefined {
    if (target === undefined) {
        return undefined;
    }
    return {
        ...target,
        wrist: cloneVector(target.wrist),
        elbowPole: cloneVector(target.elbowPole),
    };
}

function cloneVector(vector: Vector3): Vector3 {
    return vector.clone();
}

function cloneTuple(tuple: TemporalTuple3 | undefined): TemporalTuple3 | undefined {
    if (tuple === undefined) {
        return undefined;
    }
    return [tuple[0], tuple[1], tuple[2]];
}

function cloneArmSolverSource(
    source: SincroPoseRetargetedArm["solverSource"],
): SincroPoseRetargetedArm["solverSource"] {
    if (source === undefined) {
        return undefined;
    }
    return {
        primarySource: source.primarySource,
        fallbackReason: source.fallbackReason,
        bridgeReasonCodes: [...source.bridgeReasonCodes],
        targetReachRatio: source.targetReachRatio,
        temporalState: source.temporalState,
    };
}

function smoothQuaternion(
    current: SincroArmIkQuaternion | undefined,
    target: SincroArmIkQuaternion | undefined,
    alpha: number,
): SincroArmIkQuaternion | undefined {
    if (!target) {
        return undefined;
    }
    if (!current) {
        return { ...target };
    }
    return serializeQuaternion(
        deserializeQuaternion(current).slerp(deserializeQuaternion(target), alpha).normalize(),
    );
}

function deserializeQuaternion(value: SincroArmIkQuaternion): Quaternion {
    return new Quaternion(value.x, value.y, value.z, value.w);
}

function serializeQuaternion(quaternion: Quaternion): SincroArmIkQuaternion {
    return {
        x: quaternion.x,
        y: quaternion.y,
        z: quaternion.z,
        w: quaternion.w,
    };
}

function smoothVector(
    current: { x: number; y: number; z: number },
    target: { x: number; y: number; z: number },
    alpha: number,
): { x: number; y: number; z: number } {
    return {
        x: MathUtils.lerp(current.x, target.x, alpha),
        y: MathUtils.lerp(current.y, target.y, alpha),
        z: MathUtils.lerp(current.z, target.z, alpha),
    };
}

function smoothVector2(
    current: { x: number; y: number },
    target: { x: number; y: number },
    alpha: number,
): { x: number; y: number } {
    return {
        x: MathUtils.lerp(current.x, target.x, alpha),
        y: MathUtils.lerp(current.y, target.y, alpha),
    };
}
