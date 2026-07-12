import type { CanonicalCalibrationSnapshot } from "../canonical/canonicalUpperBodyState";

export const SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION = "sincro.online-calibration.v1" as const;

export type OnlineCalibrationFreezeReason =
    | "torso_low_reliability"
    | "head_low_reliability"
    | "shoulders_not_visible"
    | "border_risk"
    | "motion_blur"
    | "arm_activity_high"
    | "face_yaw_not_neutral"
    | "bone_length_inconsistent"
    | "candidate_not_stable"
    | "drift_clamped";

export type OnlineCalibrationSample = {
    mediaTimeMs: number;
    neutralYawRad?: number;
    shoulderWidth?: number;
    torsoScale?: number;
    handBaseline?: CanonicalCalibrationSnapshot["handBaseline"];
    gate: OnlineCalibrationGateInput;
};

export type OnlineCalibrationGateInput = {
    torsoReliability: number;
    headReliability: number;
    bothShouldersVisible: boolean;
    borderRisk: number;
    motionBlurRisk: number;
    armActivity: number;
    faceYawAbsRad: number;
    boneLengthConsistency: number;
};

export type OnlineSincroCalibrationState = {
    schemaVersion: typeof SINCRO_ONLINE_CALIBRATION_SCHEMA_VERSION;
    initial: CanonicalCalibrationSnapshot;
    candidate?: OnlineCalibrationCandidateSnapshot;
    committed?: OnlineCalibrationCommittedSnapshot;
    freezeReasons: OnlineCalibrationFreezeReason[];
};

export type OnlineCalibrationCandidateSnapshot = CanonicalCalibrationSnapshot & {
    stableDurationMs: number;
};

export type OnlineCalibrationCommittedSnapshot = CanonicalCalibrationSnapshot & {
    updatedAtMediaTimeMs: number;
};

export type OnlineSincroCalibrationStateParseError = {
    code: "unknown_schema_version" | "invalid_state" | "out_of_range";
    path: string[];
    message: string;
};

export type OnlineSincroCalibrationStateParseResult =
    | { ok: true; state: OnlineSincroCalibrationState }
    | { ok: false; errors: OnlineSincroCalibrationStateParseError[] };

export type OnlineCalibrationGateResult = {
    open: boolean;
    freezeReasons: OnlineCalibrationFreezeReason[];
};

export const ONLINE_CALIBRATION_FREEZE_REASON_VALUES = [
    "torso_low_reliability",
    "head_low_reliability",
    "shoulders_not_visible",
    "border_risk",
    "motion_blur",
    "arm_activity_high",
    "face_yaw_not_neutral",
    "bone_length_inconsistent",
    "candidate_not_stable",
    "drift_clamped",
] as const satisfies readonly OnlineCalibrationFreezeReason[];

export const ONLINE_CALIBRATION_PROMOTION_STABLE_DURATION_MS = 3000;
export const ONLINE_CALIBRATION_SHOULDER_BODY_TAU_SEC = 120;
export const ONLINE_CALIBRATION_NEUTRAL_YAW_TAU_SEC = 90;
export const ONLINE_CALIBRATION_HAND_BASELINE_TAU_SEC = 20;
export const ONLINE_CALIBRATION_FACE_YAW_NEUTRAL_LIMIT_RAD = (12 * Math.PI) / 180;
export const ONLINE_CALIBRATION_NEUTRAL_YAW_DRIFT_LIMIT_RAD = (10 * Math.PI) / 180;
