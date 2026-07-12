import { Vector3 } from "three/src/math/Vector3.js";
import type { TemporalPartState } from "../temporal/temporalUpperBodyState";
import { targetDirectionIsUsable } from "./sincroArmIkGeometry";

export type ArmPoleState = "stable" | "uncertain" | "extended" | "lost" | "recovering";

export type SincroArmIkElbowPole = {
    direction: Vector3;
    stabilized: boolean;
    state: ArmPoleState;
    reasonCodes: string[];
    blendWeight: number;
    weightScale: number;
};

type SincroArmIkPoleDirectionOptions = {
    elbowPole: Vector3;
    target: Vector3;
    bindPoleDirection: Vector3;
    lastPoleDirection?: Vector3;
    previousPoleDirection?: Vector3;
    poleFlipDotThreshold: number;
    temporalState?: TemporalPartState;
    elbowFlexionRad?: number;
    recoveringBlendProgress?: number;
    targetReachRatio?: number;
};

const EXTENDED_ELBOW_FLEXION_RAD = 0.18;
const EXTENDED_TARGET_REACH_RATIO = 0.96;
const SOFT_POLE_DOT_THRESHOLD = 0.18;
const HARD_REJECT_WEIGHT_SCALE = 0.68;
const SOFT_DOWNWEIGHT_SCALE = 0.82;
const DEFAULT_BLEND_WEIGHT = 1;

export function resolveArmIkPoleDirection({
    elbowPole,
    target,
    bindPoleDirection,
    lastPoleDirection,
    previousPoleDirection,
    poleFlipDotThreshold,
    temporalState,
    elbowFlexionRad,
    recoveringBlendProgress,
    targetReachRatio,
}: SincroArmIkPoleDirectionOptions): SincroArmIkElbowPole {
    const targetDirection = target.clone().normalize();
    const pole = elbowPole
        .clone()
        .sub(targetDirection.clone().multiplyScalar(elbowPole.dot(targetDirection)));
    const fallbackPole = projectPoleDirection(bindPoleDirection, targetDirection);
    const directionFallback = fallbackPole ?? fallbackPoleDirection(targetDirection);
    const candidateUsable = targetDirectionIsUsable(pole);
    return stabilizePoleDirection({
        candidate: candidateUsable ? pole.normalize() : directionFallback.clone(),
        candidateUsable,
        targetDirection,
        fallbackPole: directionFallback,
        previousPoleDirection: previousPoleDirection ?? lastPoleDirection,
        poleFlipDotThreshold,
        temporalState,
        elbowFlexionRad,
        recoveringBlendProgress,
        targetReachRatio,
    });
}

type StabilizePoleDirectionOptions = {
    candidate: Vector3;
    candidateUsable: boolean;
    targetDirection: Vector3;
    fallbackPole: Vector3;
    previousPoleDirection?: Vector3;
    poleFlipDotThreshold: number;
    temporalState?: TemporalPartState;
    elbowFlexionRad?: number;
    recoveringBlendProgress?: number;
    targetReachRatio?: number;
};

function stabilizePoleDirection({
    candidate,
    candidateUsable,
    targetDirection,
    fallbackPole,
    previousPoleDirection,
    poleFlipDotThreshold,
    temporalState,
    elbowFlexionRad,
    recoveringBlendProgress,
    targetReachRatio,
}: StabilizePoleDirectionOptions): SincroArmIkElbowPole {
    const projectedPreviousPole = projectPoleDirection(previousPoleDirection, targetDirection);
    // 最初の有効 temporal pole を bind pole と比較して reject すると、bind 側を previous として
    // commitし続け、安定した測定値でも永久に flip 扱いになる。previous 未確定時だけ測定値を
    // 初期基準にし、2 frame目以降の反転検出は従来どおり previous pole に対して行う。
    const previousPole =
        projectedPreviousPole ??
        (candidateUsable && temporalState !== undefined && temporalState !== "lost"
            ? candidate.clone()
            : fallbackPole.clone());
    const dot = candidate.dot(previousPole);
    const poleUnderdetermined = isExtendedPoleInput(elbowFlexionRad, targetReachRatio);
    const hardRejected =
        !poleUnderdetermined &&
        (temporalState === undefined || projectedPreviousPole !== undefined) &&
        candidateUsable &&
        dot < poleFlipDotThreshold;
    const softDownweighted =
        !poleUnderdetermined &&
        (temporalState === undefined || projectedPreviousPole !== undefined) &&
        candidateUsable &&
        !hardRejected &&
        dot < SOFT_POLE_DOT_THRESHOLD;
    const state = stateFromTemporalAndReach({
        temporalState,
        elbowFlexionRad,
        targetReachRatio,
        hardRejected,
    });
    const reasonCodes = [
        ...(hardRejected ? ["pole_flip_rejected"] : []),
        ...(softDownweighted ? ["pole_uncertain_downweighted"] : []),
    ];
    const blendWeight = blendWeightForState(state, recoveringBlendProgress);
    const direction = directionForState({
        state,
        candidate,
        previousPole,
        fallbackPole,
        blendWeight,
    });
    return {
        direction,
        stabilized: !candidateUsable || state !== "stable" || hardRejected,
        state,
        reasonCodes,
        blendWeight,
        weightScale: hardRejected
            ? HARD_REJECT_WEIGHT_SCALE
            : softDownweighted
              ? SOFT_DOWNWEIGHT_SCALE
              : 1,
    };
}

type ArmPoleStateOptions = {
    temporalState?: TemporalPartState;
    elbowFlexionRad?: number;
    targetReachRatio?: number;
    hardRejected: boolean;
};

function stateFromTemporalAndReach({
    temporalState,
    elbowFlexionRad,
    targetReachRatio,
    hardRejected,
}: ArmPoleStateOptions): ArmPoleState {
    if (temporalState === "lost") {
        return "lost";
    }
    if (temporalState === "recovering") {
        return "recovering";
    }
    if (isExtendedPoleInput(elbowFlexionRad, targetReachRatio)) {
        return "extended";
    }
    return hardRejected ? "uncertain" : "stable";
}

function isExtendedPoleInput(
    elbowFlexionRad: number | undefined,
    targetReachRatio: number | undefined,
): boolean {
    return (
        (isFiniteNumber(elbowFlexionRad) && elbowFlexionRad < EXTENDED_ELBOW_FLEXION_RAD) ||
        (isFiniteNumber(targetReachRatio) && targetReachRatio > EXTENDED_TARGET_REACH_RATIO)
    );
}

function blendWeightForState(
    state: ArmPoleState,
    recoveringBlendProgress: number | undefined,
): number {
    if (state === "uncertain") {
        return 0.3;
    }
    if (state === "extended") {
        return 0.5;
    }
    if (state === "recovering") {
        return isFiniteNumber(recoveringBlendProgress)
            ? Math.min(Math.max(recoveringBlendProgress, 0), 1)
            : 0;
    }
    if (state === "lost") {
        return 0;
    }
    return DEFAULT_BLEND_WEIGHT;
}

type DirectionForStateOptions = {
    state: ArmPoleState;
    candidate: Vector3;
    previousPole: Vector3;
    fallbackPole: Vector3;
    blendWeight: number;
};

function directionForState({
    state,
    candidate,
    previousPole,
    fallbackPole,
    blendWeight,
}: DirectionForStateOptions): Vector3 {
    if (state === "stable") {
        return candidate.clone();
    }
    if (state === "recovering") {
        return normalizedBlend(previousPole, candidate, blendWeight);
    }
    if (state === "uncertain" || state === "extended") {
        return normalizedBlend(previousPole, fallbackPole, blendWeight);
    }
    return previousPole.clone();
}

function normalizedBlend(from: Vector3, to: Vector3, alpha: number): Vector3 {
    const blended = from.clone().lerp(to, alpha);
    return targetDirectionIsUsable(blended) ? blended.normalize() : from.clone();
}

function projectPoleDirection(
    pole: Vector3 | undefined,
    targetDirection: Vector3,
): Vector3 | undefined {
    if (!pole) {
        return undefined;
    }
    const projected = pole
        .clone()
        .sub(targetDirection.clone().multiplyScalar(pole.dot(targetDirection)));
    return targetDirectionIsUsable(projected) ? projected.normalize() : undefined;
}

function fallbackPoleDirection(targetDirection: Vector3): Vector3 {
    const worldUp = projectPoleDirection(new Vector3(0, 1, 0), targetDirection);
    if (worldUp) {
        return worldUp;
    }
    const worldForward = projectPoleDirection(new Vector3(0, 0, 1), targetDirection);
    return worldForward ?? new Vector3(1, 0, 0);
}

function isFiniteNumber(value: number | undefined): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
