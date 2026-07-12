import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type {
    CanonicalCalibrationSnapshot,
    CanonicalUpperBodyState,
} from "../canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";

export const SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION = "sincro.initial-calibration.v1" as const;

export type InitialCalibrationStatus =
    | "not_started"
    | "ready"
    | "ready_without_hands"
    | "retry_recommended"
    | "failed";

export type InitialCalibrationStepId =
    | "precheck"
    | "neutral"
    | "a_pose"
    | "hand_open"
    | "face_yaw_optional";

export type InitialCalibrationRetryReason =
    | "shoulders_out_of_frame"
    | "face_not_front"
    | "elbow_or_wrist_hidden"
    | "hand_not_visible"
    | "too_dark"
    | "motion_blur"
    | "low_reliability"
    | "camera_unavailable";

export type InitialCalibrationStepResult = {
    id: InitialCalibrationStepId;
    status: "ready" | "degraded" | "retry" | "failed" | "skipped";
    validDurationMs: number;
    score: number;
    retryReasons: InitialCalibrationRetryReason[];
    measurements: {
        neutralYawRad?: number;
        shoulderWidth?: number;
        torsoScale?: number;
        handBaseline?: CanonicalCalibrationSnapshot["handBaseline"];
    };
    debug: Record<string, number | boolean | string>;
};

export type InitialSincroCalibrationSession = {
    schemaVersion: typeof SINCRO_INITIAL_CALIBRATION_SCHEMA_VERSION;
    status: InitialCalibrationStatus;
    startedAtMediaTimeMs: number;
    completedAtMediaTimeMs?: number;
    steps: Partial<Record<InitialCalibrationStepId, InitialCalibrationStepResult>>;
    userGuideMessages: string[];
    debugReasons: InitialCalibrationRetryReason[];
};

export type EvaluateInitialCalibrationStepInput = {
    id: InitialCalibrationStepId;
    reliability: ReliabilityMap;
    cameraQuality?: CameraQualityScore;
    canonical?: CanonicalUpperBodyState;
    validDurationMs: number;
};

export { mapInitialCalibrationGuideMessages } from "./initialSincroCalibrationGuideMessages";
export {
    createCanonicalCalibrationFromInitialSession,
    summarizeInitialCalibrationSession,
} from "./initialSincroCalibrationSession";
export { evaluateInitialCalibrationStep } from "./initialSincroCalibrationStepEvaluation";
