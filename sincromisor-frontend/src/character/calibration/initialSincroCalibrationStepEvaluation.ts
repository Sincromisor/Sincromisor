import type { CameraQualityScore } from "../../features/gaze/trackingRuntime/cameraQualityScore";
import type {
    EvaluateInitialCalibrationStepInput,
    InitialCalibrationRetryReason,
    InitialCalibrationStepResult,
} from "./initialSincroCalibration";
import {
    createDurationCheck,
    createMeasurements,
    createStepChecks,
    type InitialCalibrationCheckResult,
} from "./initialSincroCalibrationStepChecks";

export function evaluateInitialCalibrationStep(
    input: EvaluateInitialCalibrationStepInput,
): InitialCalibrationStepResult {
    const checks = [...createStepChecks(input), createDurationCheck(input.validDurationMs)];
    const activeChecks = checks.filter((check) => !check.skipped);
    const retryReasons = collectRetryReasons(input.cameraQuality, activeChecks);
    const hasHardCameraFailure =
        input.id === "precheck" && retryReasons.includes("camera_unavailable");
    const hasRetry = activeChecks.some((check) => !check.degraded);
    const hasDegraded = activeChecks.some((check) => check.degraded && !check.ready);
    return {
        id: input.id,
        status: createStepStatus(activeChecks, hasHardCameraFailure, hasRetry, hasDegraded),
        validDurationMs: input.validDurationMs,
        score: createStepScore(activeChecks, hasHardCameraFailure, hasRetry, hasDegraded),
        retryReasons,
        measurements: createMeasurements(input.id, input.canonical),
        debug: createDebug(checks),
    };
}

function createStepStatus(
    activeChecks: InitialCalibrationCheckResult[],
    hasHardCameraFailure: boolean,
    hasRetry: boolean,
    hasDegraded: boolean,
): InitialCalibrationStepResult["status"] {
    if (activeChecks.length === 0) {
        return "skipped";
    }
    if (hasHardCameraFailure) {
        return "failed";
    }
    if (hasRetry) {
        return "retry";
    }
    if (hasDegraded) {
        return "degraded";
    }
    return "ready";
}

function createStepScore(
    activeChecks: InitialCalibrationCheckResult[],
    hasHardCameraFailure: boolean,
    hasRetry: boolean,
    hasDegraded: boolean,
): number {
    if (activeChecks.length === 0 || hasHardCameraFailure || hasRetry) {
        return 0;
    }
    return hasDegraded ? 0.7 : 1;
}

function createDebug(
    checks: InitialCalibrationCheckResult[],
): Record<string, number | boolean | string> {
    const debug: Record<string, number | boolean | string> = {};
    for (const check of checks) {
        debug[`${check.debugKey}.ready`] = check.ready;
        debug[`${check.debugKey}.degraded`] = check.degraded;
        debug[`${check.debugKey}.skipped`] = check.skipped;
        if (check.value !== undefined) {
            debug[check.debugKey] = check.value;
        }
    }
    return debug;
}

function collectRetryReasons(
    cameraQuality: CameraQualityScore | undefined,
    checks: InitialCalibrationCheckResult[],
): InitialCalibrationRetryReason[] {
    const reasons: InitialCalibrationRetryReason[] = [];
    for (const check of checks) {
        if (!check.ready && check.reason !== undefined) {
            reasons.push(check.reason);
        }
    }
    if (cameraQuality?.reasons.includes("motion_blur_risk")) {
        reasons.push("motion_blur");
    }
    return reasons.filter((reason, index) => reasons.indexOf(reason) === index);
}
