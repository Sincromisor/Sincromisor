import type { MinimalAvatarMotionProfile } from "../avatarProfile/minimalAvatarMotionProfile";
import type { SincroArmIkTarget, SincroArmSide } from "../ik/sincroArmIkTypes";
import type {
    TemporalPartState,
    TemporalTuple3,
    TemporalUpperBodyState,
} from "../temporal/temporalUpperBodyState";

/** 肩幅単位の撮影者座標をVRM骨長へ変換する入力・診断契約。 */
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
    maxReachRatio: 0.985;
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
    reach?: {
        requestedReachRatio: number;
        bridgeAppliedReachRatio: number;
        bridgeClamped: boolean;
    };
};
