import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type { CanonicalUpperBodyState } from "../canonical/canonicalUpperBodyState";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import type {
    EvaluateInitialCalibrationStepInput,
    InitialCalibrationRetryReason,
    InitialCalibrationStepId,
    InitialCalibrationStepResult,
} from "./initialSincroCalibration";

export type InitialCalibrationCheckResult = {
    ready: boolean;
    degraded: boolean;
    skipped: boolean;
    reason?: InitialCalibrationRetryReason;
    debugKey: string;
    value?: number | boolean | string;
};

const READY_DURATION_MS = 1000;
const DEGRADED_DURATION_MS = 700;
const TORSO_READY_WEIGHT = 0.75;
const TORSO_DEGRADED_WEIGHT = 0.6;
const HEAD_READY_WEIGHT = 0.7;
const HEAD_DEGRADED_WEIGHT = 0.55;
const ARM_READY_WEIGHT = 0.65;
const ARM_DEGRADED_WEIGHT = 0.5;
const HAND_READY_WEIGHT = 0.65;
const HAND_DEGRADED_WEIGHT = 0.5;
const BORDER_READY_RISK = 0.3;
const BORDER_DEGRADED_RISK = 0.45;
const HAND_SMALL_READY_RISK = 0.45;
const HAND_SMALL_DEGRADED_RISK = 0.65;
const FACE_READY_YAW_RAD = (10 * Math.PI) / 180;
const FACE_DEGRADED_YAW_RAD = (15 * Math.PI) / 180;

export function createStepChecks(
    input: EvaluateInitialCalibrationStepInput,
): InitialCalibrationCheckResult[] {
    switch (input.id) {
        case "precheck":
            return createPrecheckChecks(input.cameraQuality);
        case "neutral":
            return createNeutralChecks(input.reliability, input.canonical);
        case "a_pose":
            return createAPoseChecks(input.reliability, input.cameraQuality);
        case "hand_open":
            return createHandOpenChecks(input.reliability, input.cameraQuality);
        case "face_yaw_optional":
            return createFaceYawOptionalChecks(input.reliability, input.canonical);
    }
}

export function createDurationCheck(validDurationMs: number): InitialCalibrationCheckResult {
    return createScoreCheck(
        "validDurationMs",
        validDurationMs,
        READY_DURATION_MS,
        DEGRADED_DURATION_MS,
        "low_reliability",
        false,
    );
}

export function createMeasurements(
    id: InitialCalibrationStepId,
    canonical: CanonicalUpperBodyState | undefined,
): InitialCalibrationStepResult["measurements"] {
    if (canonical === undefined) {
        return {};
    }
    if (id === "neutral") {
        return {
            neutralYawRad: canonical.torso.yawRad,
            shoulderWidth: canonical.torso.shoulderWidth,
            torsoScale: canonical.torso.torsoScale,
        };
    }
    if (id === "hand_open") {
        return {
            handBaseline: canonical.calibration.handBaseline,
        };
    }
    return {};
}

function createPrecheckChecks(
    cameraQuality: CameraQualityScore | undefined,
): InitialCalibrationCheckResult[] {
    const overallStatus = cameraQuality?.overall.status;
    const torsoInFrame = cameraQuality?.components.torsoInFrame;
    return [
        {
            ready: overallStatus !== "bad",
            degraded: overallStatus !== "bad",
            skipped: false,
            reason: overallStatus === "bad" ? "camera_unavailable" : undefined,
            debugKey: "cameraQuality.overall.status",
            value: overallStatus ?? "not_provided",
        },
        createScoreCheck(
            "cameraQuality.components.torsoInFrame.score",
            torsoInFrame?.score,
            TORSO_READY_WEIGHT,
            TORSO_DEGRADED_WEIGHT,
            "shoulders_out_of_frame",
            true,
        ),
    ];
}

function createNeutralChecks(
    reliability: ReliabilityMap,
    canonical: CanonicalUpperBodyState | undefined,
): InitialCalibrationCheckResult[] {
    return [
        createScoreCheck(
            "reliability.parts.torso.finalWeight",
            reliability.parts.torso.finalWeight,
            TORSO_READY_WEIGHT,
            TORSO_DEGRADED_WEIGHT,
            "low_reliability",
            false,
        ),
        createScoreCheck(
            "reliability.parts.head.finalWeight",
            reliability.parts.head.finalWeight,
            HEAD_READY_WEIGHT,
            HEAD_DEGRADED_WEIGHT,
            "low_reliability",
            false,
        ),
        createMaxCheck(
            "Math.abs(canonical.torso.yawRad)",
            absFinite(canonical?.torso.yawRad),
            FACE_READY_YAW_RAD,
            FACE_DEGRADED_YAW_RAD,
            "face_not_front",
            false,
        ),
    ];
}

function createAPoseChecks(
    reliability: ReliabilityMap,
    cameraQuality: CameraQualityScore | undefined,
): InitialCalibrationCheckResult[] {
    const minArmWeight = Math.min(
        reliability.joints.leftElbow.finalWeight,
        reliability.joints.rightElbow.finalWeight,
        reliability.joints.leftWrist.finalWeight,
        reliability.joints.rightWrist.finalWeight,
    );
    return [
        createScoreCheck(
            "min(reliability.joints.elbow/wrist.finalWeight)",
            minArmWeight,
            ARM_READY_WEIGHT,
            ARM_DEGRADED_WEIGHT,
            "elbow_or_wrist_hidden",
            false,
        ),
        createMaxCheck(
            "1 - cameraQuality.components.borderRisk.score",
            riskFromScore(cameraQuality?.components.borderRisk?.score),
            BORDER_READY_RISK,
            BORDER_DEGRADED_RISK,
            "shoulders_out_of_frame",
            true,
        ),
    ];
}

function createHandOpenChecks(
    reliability: ReliabilityMap,
    cameraQuality: CameraQualityScore | undefined,
): InitialCalibrationCheckResult[] {
    const maxHandWeight = Math.max(
        reliability.parts.leftHand.finalWeight,
        reliability.parts.rightHand.finalWeight,
    );
    return [
        createScoreCheck(
            "max(reliability.parts.leftHand/rightHand.finalWeight)",
            maxHandWeight,
            HAND_READY_WEIGHT,
            HAND_DEGRADED_WEIGHT,
            "hand_not_visible",
            false,
        ),
        createMaxCheck(
            "1 - cameraQuality.components.handSmallRisk.score",
            riskFromScore(cameraQuality?.components.handSmallRisk?.score),
            HAND_SMALL_READY_RISK,
            HAND_SMALL_DEGRADED_RISK,
            "hand_not_visible",
            true,
        ),
    ];
}

function createFaceYawOptionalChecks(
    reliability: ReliabilityMap,
    canonical: CanonicalUpperBodyState | undefined,
): InitialCalibrationCheckResult[] {
    return [
        createScoreCheck(
            "reliability.parts.head.finalWeight",
            reliability.parts.head.finalWeight,
            HEAD_READY_WEIGHT,
            HEAD_DEGRADED_WEIGHT,
            "low_reliability",
            false,
        ),
        createMaxCheck(
            "Math.abs(canonical.torso.yawRad)",
            absFinite(canonical?.torso.yawRad),
            FACE_READY_YAW_RAD,
            FACE_DEGRADED_YAW_RAD,
            "face_not_front",
            false,
        ),
    ];
}

function createScoreCheck(
    debugKey: string,
    value: number | undefined,
    readyThreshold: number,
    degradedThreshold: number,
    reason: InitialCalibrationRetryReason,
    skipWhenMissing: boolean,
): InitialCalibrationCheckResult {
    if (value === undefined) {
        return createMissingCheck(debugKey, reason, skipWhenMissing);
    }
    return {
        ready: value >= readyThreshold,
        degraded: value >= degradedThreshold,
        skipped: false,
        reason: value >= readyThreshold ? undefined : reason,
        debugKey,
        value,
    };
}

function createMaxCheck(
    debugKey: string,
    value: number | undefined,
    readyThreshold: number,
    degradedThreshold: number,
    reason: InitialCalibrationRetryReason,
    skipWhenMissing: boolean,
): InitialCalibrationCheckResult {
    if (value === undefined) {
        return createMissingCheck(debugKey, reason, skipWhenMissing);
    }
    return {
        ready: value <= readyThreshold,
        degraded: value <= degradedThreshold,
        skipped: false,
        reason: value <= readyThreshold ? undefined : reason,
        debugKey,
        value,
    };
}

function createMissingCheck(
    debugKey: string,
    reason: InitialCalibrationRetryReason,
    skipWhenMissing: boolean,
): InitialCalibrationCheckResult {
    return {
        ready: false,
        degraded: false,
        skipped: skipWhenMissing,
        reason: skipWhenMissing ? undefined : reason,
        debugKey,
        value: "missing",
    };
}

function absFinite(value: number | undefined): number | undefined {
    if (value === undefined || !Number.isFinite(value)) {
        return undefined;
    }
    return Math.abs(value);
}

function riskFromScore(score: number | undefined): number | undefined {
    if (score === undefined || !Number.isFinite(score)) {
        return undefined;
    }
    return 1 - score;
}
