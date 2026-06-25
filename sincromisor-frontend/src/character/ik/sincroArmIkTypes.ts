import type { Vector3 } from "three/src/math/Vector3.js";
import type { TemporalPartState } from "../temporal/temporalUpperBodyState";
import type { SincroArmIkConstraintSnapshot } from "./sincroArmIkConstraint";

export type SincroArmSide = "left" | "right";

export type SincroArmIkTarget = {
    wrist: Vector3;
    elbowPole: Vector3;
    weight: number;
    temporalState?: TemporalPartState;
    elbowFlexionRad?: number;
    recoveringBlendProgress?: number;
    targetReachRatio?: number;
    wristRollInfluence?: number;
};

export type SincroArmIkQuaternion = {
    x: number;
    y: number;
    z: number;
    w: number;
};

export type SincroArmIkSolveResult = {
    upperArmQuaternion: SincroArmIkQuaternion;
    lowerArmQuaternion: SincroArmIkQuaternion;
    neutralUpperArmQuaternion: SincroArmIkQuaternion;
    neutralLowerArmQuaternion: SincroArmIkQuaternion;
    targetClamped: boolean;
    constraint: SincroArmIkConstraintSnapshot;
    weight: number;
};

export type SincroArmIkOptions = {
    maxUpperArmDeltaRad: number;
    maxLowerArmDeltaRad: number;
    minReachRatio: number;
    maxReachRatio: number;
    overheadMinReachRatio: number;
    poleFlipDotThreshold: number;
};
