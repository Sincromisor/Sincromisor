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
    if (targetDirectionIsUsable(pole)) {
        return stabilizePoleDirection({
            candidate: pole.normalize(),
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
    return {
        direction: directionFallback,
        stabilized: true,
        state: stateFromTemporalAndReach({
            temporalState,
            elbowFlexionRad,
            targetReachRatio,
            hardRejected: false,
        }),
        reasonCodes: [],
        blendWeight: 0,
        weightScale: 1,
    };
}

type StabilizePoleDirectionOptions = {
    candidate: Vector3;
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
    targetDirection,
    fallbackPole,
    previousPoleDirection,
    poleFlipDotThreshold,
    temporalState,
    elbowFlexionRad,
    recoveringBlendProgress,
    targetReachRatio,
}: StabilizePoleDirectionOptions): SincroArmIkElbowPole {
    const previousPole =
        projectPoleDirection(previousPoleDirection, targetDirection) ?? fallbackPole.clone();
    const dot = candidate.dot(previousPole);
    const hardRejected = dot < poleFlipDotThreshold;
    const softDownweighted = !hardRejected && dot < SOFT_POLE_DOT_THRESHOLD;
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
        stabilized: state !== "stable" || hardRejected,
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
    if (
        (isFiniteNumber(elbowFlexionRad) && elbowFlexionRad < EXTENDED_ELBOW_FLEXION_RAD) ||
        (isFiniteNumber(targetReachRatio) && targetReachRatio > EXTENDED_TARGET_REACH_RATIO)
    ) {
        return "extended";
    }
    return hardRejected ? "uncertain" : "stable";
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
