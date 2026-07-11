import { Vector3 } from "three/src/math/Vector3.js";
import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroArmIkTarget, SincroArmSide } from "../ik/sincroArmIkTypes";
import type {
    TemporalArmState,
    TemporalPartState,
    TemporalTuple3,
    TemporalUpperBodyState,
} from "../temporal/temporalUpperBodyState";

const MAX_REACH_RATIO = 0.985;
const MIN_VECTOR_LENGTH = 1e-6;

export type TemporalArmIkSolverMeasurements = {
    shoulderWidth: number;
    upperArmLength: number;
    lowerArmLength: number;
};

export type TemporalArmIkScaleSnapshot = {
    shoulderWidth: number;
    upperArmLength: number;
    lowerArmLength: number;
    armLength: number;
    defaultReachScale: number;
    lateralScale: number;
    verticalScale: number;
    depthCompression: number;
    maxReachRatio: typeof MAX_REACH_RATIO;
};

export type TemporalArmIkDebugSnapshot = {
    usedBodyLocalWrist: boolean;
    usedBodyLocalElbow: boolean;
    shoulderLocal: TemporalTuple3;
    wristBeforeClamp?: TemporalTuple3;
    wristAfterClamp?: TemporalTuple3;
    elbowPoleBeforeNormalize?: TemporalTuple3;
    weightBeforeStateScale: number;
    weightAfterStateScale: number;
};

export type TemporalArmIkBridgeInput = {
    temporal: TemporalUpperBodyState;
    side: SincroArmSide;
    profile: MinimalAvatarMotionProfile;
    solver: TemporalArmIkSolverMeasurements;
};

export type TemporalArmIkBridgeResult = {
    target?: SincroArmIkTarget;
    reasonCodes: string[];
    scale: TemporalArmIkScaleSnapshot;
    sourceState: TemporalPartState;
    debug: TemporalArmIkDebugSnapshot;
};

/**
 * TemporalUpperBodyState の body-local / scalar arm state を IK solver が読む肩ローカル target へ変換する。
 *
 * Pose wrist / Hand wrist はここでは読まず、Temporal state と avatar profile / solver measurement だけを
 * source of truth にする。lost や非 finite input は例外にせず `target` 欠損と reason code で返し、
 * production caller が pose-snapshot fallback と debug snapshot を同一 frame で扱えるようにする。
 */
export function createTemporalArmIkInput(
    input: TemporalArmIkBridgeInput,
): TemporalArmIkBridgeResult {
    const arm = input.temporal.arms[input.side];
    const scale = createScaleSnapshot(input.side, input.profile, input.solver);
    const shoulderLocal = createShoulderLocal(input.side, scale.shoulderWidth);
    const sourceState = knownTemporalPartStateOrLost(arm.state);
    const zeroDebug = createZeroDebug(arm, shoulderLocal);

    if (sourceState !== arm.state || !temporalArmInputIsFinite(arm, scale)) {
        return {
            reasonCodes: ["invalid_temporal_arm"],
            scale,
            sourceState,
            debug: zeroDebug,
        };
    }
    if (arm.state === "lost") {
        return {
            reasonCodes: ["temporal_arm_lost"],
            scale,
            sourceState,
            debug: zeroDebug,
        };
    }

    const wristBeforeClamp = arm.bodyLocalWrist
        ? bodyLocalTargetToShoulderLocal(arm.bodyLocalWrist, shoulderLocal, scale)
        : scalarArmToShoulderLocal(arm, input.side, scale);
    const wristAfterClamp = clampToMaxReach(
        wristBeforeClamp,
        scale.armLength * scale.maxReachRatio,
    );
    const elbowPoleBeforeNormalize = arm.bodyLocalElbow
        ? bodyLocalTargetToShoulderLocal(arm.bodyLocalElbow, shoulderLocal, scale)
        : createFallbackElbowPole(arm, input.side, scale);
    const weightBeforeStateScale = arm.confidence;
    const weightAfterStateScale = weightForTemporalArmState(arm);
    const targetReachRatio = scale.armLength > 0 ? wristAfterClamp.length() / scale.armLength : 0;

    return {
        target: {
            wrist: wristAfterClamp,
            elbowPole: elbowPoleBeforeNormalize,
            weight: weightAfterStateScale,
            temporalState: arm.state,
            elbowFlexionRad: arm.elbowFlexionRad,
            recoveringBlendProgress: arm.recoveringBlend?.progress,
            targetReachRatio,
            wristRollInfluence: input.profile.solverDefaults.wristRollInfluence,
        },
        reasonCodes: [],
        scale,
        sourceState,
        debug: {
            usedBodyLocalWrist: arm.bodyLocalWrist !== undefined,
            usedBodyLocalElbow: arm.bodyLocalElbow !== undefined,
            shoulderLocal,
            wristBeforeClamp: vectorToTuple(wristBeforeClamp),
            wristAfterClamp: vectorToTuple(wristAfterClamp),
            elbowPoleBeforeNormalize: vectorToTuple(elbowPoleBeforeNormalize),
            weightBeforeStateScale,
            weightAfterStateScale,
        },
    };
}

function createScaleSnapshot(
    side: SincroArmSide,
    profile: MinimalAvatarMotionProfile,
    solver: TemporalArmIkSolverMeasurements,
): TemporalArmIkScaleSnapshot {
    const upperArmLength =
        side === "left"
            ? (profile.measurements.leftUpperArmLength ?? solver.upperArmLength)
            : (profile.measurements.rightUpperArmLength ?? solver.upperArmLength);
    const lowerArmLength =
        side === "left"
            ? (profile.measurements.leftLowerArmLength ?? solver.lowerArmLength)
            : (profile.measurements.rightLowerArmLength ?? solver.lowerArmLength);
    const shoulderWidth = profile.measurements.shoulderWidth ?? solver.shoulderWidth;

    return {
        shoulderWidth,
        upperArmLength,
        lowerArmLength,
        armLength: upperArmLength + lowerArmLength,
        defaultReachScale: profile.solverDefaults.defaultReachScale,
        lateralScale: profile.solverDefaults.lateralScale,
        verticalScale: profile.solverDefaults.verticalScale,
        depthCompression: profile.solverDefaults.depthCompression,
        maxReachRatio: MAX_REACH_RATIO,
    };
}

function createShoulderLocal(side: SincroArmSide, shoulderWidth: number): TemporalTuple3 {
    const sideSign = side === "left" ? -1 : 1;
    return [sideSign * shoulderWidth * 0.5, 0, 0];
}

function createZeroDebug(
    arm: TemporalArmState,
    shoulderLocal: TemporalTuple3,
): TemporalArmIkDebugSnapshot {
    return {
        usedBodyLocalWrist: arm.bodyLocalWrist !== undefined,
        usedBodyLocalElbow: arm.bodyLocalElbow !== undefined,
        shoulderLocal,
        weightBeforeStateScale: 0,
        weightAfterStateScale: 0,
    };
}

function bodyLocalTargetToShoulderLocal(
    bodyLocal: TemporalTuple3,
    shoulderLocal: TemporalTuple3,
    scale: TemporalArmIkScaleSnapshot,
): Vector3 {
    return new Vector3(
        (bodyLocal[0] - shoulderLocal[0]) * scale.lateralScale * scale.defaultReachScale,
        (bodyLocal[1] - shoulderLocal[1]) * scale.verticalScale * scale.defaultReachScale,
        (bodyLocal[2] - shoulderLocal[2]) * scale.depthCompression * scale.defaultReachScale,
    );
}

function scalarArmToShoulderLocal(
    arm: TemporalArmState,
    side: SincroArmSide,
    scale: TemporalArmIkScaleSnapshot,
): Vector3 {
    const sideSign = side === "left" ? -1 : 1;
    const rawReach = arm.reach * scale.armLength;
    return new Vector3(
        arm.openness * sideSign * rawReach * scale.lateralScale * scale.defaultReachScale,
        Math.sin(arm.elevationRad) * rawReach * scale.verticalScale * scale.defaultReachScale,
        arm.forwardness * rawReach * scale.depthCompression * scale.defaultReachScale,
    );
}

function createFallbackElbowPole(
    arm: TemporalArmState,
    side: SincroArmSide,
    scale: TemporalArmIkScaleSnapshot,
): Vector3 {
    const sideSign = side === "left" ? -1 : 1;
    const elbowBend = Math.max(Math.sin(arm.elbowFlexionRad), 0.2);
    const outward = Math.max(Math.abs(arm.openness), 0.25);
    return new Vector3(
        sideSign * outward * scale.upperArmLength,
        elbowBend * scale.upperArmLength,
        0,
    );
}

function clampToMaxReach(target: Vector3, maxReach: number): Vector3 {
    const length = target.length();
    if (length <= maxReach || length < MIN_VECTOR_LENGTH) {
        return target.clone();
    }
    return target.clone().multiplyScalar(maxReach / length);
}

function weightForTemporalArmState(arm: TemporalArmState): number {
    switch (arm.state) {
        case "tracked":
            return arm.confidence;
        case "suspect":
            return arm.confidence * 0.55;
        case "recovering":
            return arm.confidence * (arm.recoveringBlend?.progress ?? 0);
        case "predicted":
            return arm.confidence * 0.35;
        case "lost":
            return 0;
    }
}

function knownTemporalPartStateOrLost(state: string): TemporalPartState {
    switch (state) {
        case "tracked":
        case "suspect":
        case "predicted":
        case "lost":
        case "recovering":
            return state;
        default:
            return "lost";
    }
}

function temporalArmInputIsFinite(
    arm: TemporalArmState,
    scale: TemporalArmIkScaleSnapshot,
): boolean {
    return (
        numbersAreFinite([
            arm.confidence,
            arm.reach,
            arm.elevationRad,
            arm.openness,
            arm.forwardness,
            arm.elbowFlexionRad,
            scale.shoulderWidth,
            scale.upperArmLength,
            scale.lowerArmLength,
            scale.armLength,
            scale.defaultReachScale,
            scale.lateralScale,
            scale.verticalScale,
            scale.depthCompression,
        ]) &&
        tupleIsFinite(arm.bodyLocalWrist) &&
        tupleIsFinite(arm.bodyLocalElbow) &&
        (arm.recoveringBlend === undefined || Number.isFinite(arm.recoveringBlend.progress))
    );
}

function tupleIsFinite(tuple: TemporalTuple3 | undefined): boolean {
    return tuple === undefined || numbersAreFinite(tuple);
}

function numbersAreFinite(values: readonly number[]): boolean {
    return values.every((value) => Number.isFinite(value));
}

function vectorToTuple(vector: Vector3): TemporalTuple3 {
    return [vector.x, vector.y, vector.z];
}
