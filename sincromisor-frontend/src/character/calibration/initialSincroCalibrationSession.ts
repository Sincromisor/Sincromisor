import {
    type CanonicalCalibrationSnapshot,
    DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT,
} from "../canonical/canonicalUpperBodyState";
import type {
    InitialCalibrationRetryReason,
    InitialCalibrationStatus,
    InitialCalibrationStepResult,
    InitialSincroCalibrationSession,
} from "./initialSincroCalibration";
import { mapInitialCalibrationGuideMessages } from "./initialSincroCalibrationGuideMessages";

export function summarizeInitialCalibrationSession(
    session: InitialSincroCalibrationSession,
): InitialSincroCalibrationSession {
    const precheck = session.steps.precheck;
    const neutral = session.steps.neutral;
    const aPose = session.steps.a_pose;
    const handOpen = session.steps.hand_open;
    const coreSteps = [precheck, neutral, aPose];
    const debugReasons = collectSessionReasons(session.steps);
    const status = summarizeStatus(coreSteps, handOpen, session.steps);
    return {
        ...session,
        status,
        userGuideMessages: mapInitialCalibrationGuideMessages(debugReasons),
        debugReasons,
    };
}

export function createCanonicalCalibrationFromInitialSession(
    session: InitialSincroCalibrationSession,
): CanonicalCalibrationSnapshot {
    const measurements = collectMeasurements(session.steps);
    const completedAtMediaTimeMs = session.completedAtMediaTimeMs ?? session.startedAtMediaTimeMs;
    return {
        id: `initial-calibration:${session.startedAtMediaTimeMs}:${completedAtMediaTimeMs}`,
        source: "initial",
        capturedAtMediaTimeMs: completedAtMediaTimeMs,
        neutralYawRad:
            measurements.neutralYawRad ?? DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.neutralYawRad,
        shoulderWidth:
            measurements.shoulderWidth ?? DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.shoulderWidth,
        torsoScale: measurements.torsoScale ?? DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.torsoScale,
        handBaseline: {
            left:
                measurements.handBaseline?.left ??
                DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.handBaseline.left,
            right:
                measurements.handBaseline?.right ??
                DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT.handBaseline.right,
        },
    };
}

function summarizeStatus(
    coreSteps: (InitialCalibrationStepResult | undefined)[],
    handOpen: InitialCalibrationStepResult | undefined,
    steps: InitialSincroCalibrationSession["steps"],
): InitialCalibrationStatus {
    if (Object.keys(steps).length === 0) {
        return "not_started";
    }
    if (coreSteps.some((step) => isHardFailedCoreStep(step))) {
        return "failed";
    }
    const coreReady = coreSteps.every((step) => step?.status === "ready");
    if (coreReady && handOpen?.status === "ready") {
        return "ready";
    }
    if (coreReady && isHandOptionalStatus(handOpen?.status)) {
        return "ready_without_hands";
    }
    if (coreSteps.some((step) => step !== undefined)) {
        return "retry_recommended";
    }
    return "not_started";
}

function isHardFailedCoreStep(step: InitialCalibrationStepResult | undefined): boolean {
    if (step === undefined) {
        return false;
    }
    if (step.id === "precheck") {
        return step.status === "failed";
    }
    return step.status === "failed" || (step.status === "retry" && step.score === 0);
}

function isHandOptionalStatus(status: InitialCalibrationStepResult["status"] | undefined): boolean {
    return (
        status === undefined ||
        status === "degraded" ||
        status === "retry" ||
        status === "failed" ||
        status === "skipped"
    );
}

function collectSessionReasons(
    steps: InitialSincroCalibrationSession["steps"],
): InitialCalibrationRetryReason[] {
    const reasons: InitialCalibrationRetryReason[] = [];
    for (const stepId of ["precheck", "neutral", "a_pose", "hand_open"] as const) {
        const step = steps[stepId];
        if (step !== undefined && step.status !== "ready") {
            reasons.push(...step.retryReasons);
        }
    }
    return reasons.filter((reason, index) => reasons.indexOf(reason) === index);
}

function collectMeasurements(
    steps: InitialSincroCalibrationSession["steps"],
): InitialCalibrationStepResult["measurements"] {
    const measurements: InitialCalibrationStepResult["measurements"] = {};
    for (const stepId of ["neutral", "a_pose", "hand_open"] as const) {
        const stepMeasurements = steps[stepId]?.measurements;
        if (stepMeasurements === undefined) {
            continue;
        }
        measurements.neutralYawRad ??= stepMeasurements.neutralYawRad;
        measurements.shoulderWidth ??= stepMeasurements.shoulderWidth;
        measurements.torsoScale ??= stepMeasurements.torsoScale;
        measurements.handBaseline ??= stepMeasurements.handBaseline;
    }
    return measurements;
}
