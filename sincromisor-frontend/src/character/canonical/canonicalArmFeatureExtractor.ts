import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import {
    angleBetween,
    calculateForwardness,
    clampConfidence,
    clampRange,
    classifyArm,
    FALLBACK_CONFIDENCE_MAX,
    hasLostJoint,
    MIN_ARM_LENGTH,
    minWorldConfidence,
    pushWarning,
    readBodyPoint,
    toBodyLocal,
} from "./canonicalArmFeatureMath";
import type { CanonicalTorsoFrameResult } from "./canonicalTorsoFrameEstimator";
import { length, subtract, tuple3 } from "./canonicalTuple3Math";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalOutOfRangeField,
    type CanonicalUpperBodyState,
    type CanonicalWarningCode,
} from "./canonicalUpperBodyState";

export type CanonicalArmFeatureInput = {
    pose: SincroPoseMotionSnapshot;
    torso: CanonicalTorsoFrameResult;
    previous?: CanonicalUpperBodyState;
    mediaTimeMs: number;
};

export type CanonicalSingleArmFeatureInput = {
    side: "left" | "right";
    arm: SincroPoseArmMotionSnapshot;
    torso: CanonicalTorsoFrameResult;
};

export function extractCanonicalArmState(input: CanonicalSingleArmFeatureInput): CanonicalArmState {
    const { torso: torsoFrame } = input.torso;
    const outOfRangeFields: CanonicalOutOfRangeField[] = [];
    const warnings: CanonicalWarningCode[] = [];
    const shoulderPoint = readBodyPoint(input.arm.targets.shoulder, torsoFrame.shoulderCenter);
    const elbowPoint = readBodyPoint(input.arm.targets.elbow, torsoFrame.shoulderCenter);
    const wristPoint = readBodyPoint(input.arm.targets.wrist, torsoFrame.shoulderCenter);
    const shoulderLocal = toBodyLocal(shoulderPoint.position, torsoFrame);
    const elbowLocal = toBodyLocal(elbowPoint.position, torsoFrame);
    const wristLocal = toBodyLocal(wristPoint.position, torsoFrame);
    const upperArmVector = subtract(elbowPoint.position, shoulderPoint.position);
    const lowerArmVector = subtract(wristPoint.position, elbowPoint.position);
    const shoulderToWrist = subtract(wristLocal, shoulderLocal);
    const armLength = length(upperArmVector) + length(lowerArmVector);
    const invalidArmLength = !Number.isFinite(armLength) || armLength <= MIN_ARM_LENGTH;
    const usedWorldFallback =
        shoulderPoint.usedFallback || elbowPoint.usedFallback || wristPoint.usedFallback;

    collectInputWarnings({ warnings, torsoFrame, usedWorldFallback, invalidArmLength });

    const reach = clampRange(
        "reach",
        invalidArmLength ? 0 : length(shoulderToWrist) / armLength,
        0,
        1.15,
        outOfRangeFields,
    );
    const direction = normalizeDirection(shoulderToWrist);
    const elevationRad = clampRange(
        "elevationRad",
        Math.asin(Math.max(-1, Math.min(1, direction[1]))),
        -Math.PI / 2,
        Math.PI / 2,
        outOfRangeFields,
    );
    const openness = clampRange(
        "openness",
        direction[0] * (input.side === "right" ? 1 : -1),
        -1,
        1,
        outOfRangeFields,
    );
    const forwardness = clampRange(
        "forwardness",
        calculateForwardness({
            shoulderLocal,
            wristLocal,
            shoulderWidth: torsoFrame.shoulderWidth,
            arm: input.arm,
        }),
        0,
        1,
        outOfRangeFields,
    );
    const elbowFlexionRad = clampRange(
        "elbowFlexionRad",
        Math.PI -
            angleBetween(subtract(shoulderLocal, elbowLocal), subtract(wristLocal, elbowLocal)),
        0,
        Math.PI,
        outOfRangeFields,
    );

    if (outOfRangeFields.length > 0) {
        pushWarning(warnings, "out_of_range");
    }

    const confidence = calculateArmConfidence({
        arm: input.arm,
        torsoConfidence: torsoFrame.confidence,
        torsoWarnings: torsoFrame.warnings,
        usedWorldFallback,
        invalidArmLength,
    });
    if (confidence < 0.15) {
        pushWarning(warnings, "low_confidence");
    }

    return {
        reach,
        elevationRad,
        openness,
        forwardness,
        elbowFlexionRad,
        classification: classifyArm(confidence, openness, forwardness),
        bodyLocalWrist: wristLocal,
        bodyLocalElbow: elbowLocal,
        confidence,
        source: confidence > 0 && input.arm.tracked && !invalidArmLength ? "pose" : "neutral",
        warnings,
        outOfRangeFields,
    };
}

export function createCanonicalUpperBodyState(
    input: CanonicalArmFeatureInput,
): CanonicalUpperBodyState {
    const { torso: torsoFrame, calibration } = input.torso;
    const left = extractCanonicalArmState({
        side: "left",
        arm: input.pose.leftArm,
        torso: input.torso,
    });
    const right = extractCanonicalArmState({
        side: "right",
        arm: input.pose.rightArm,
        torso: input.torso,
    });
    const warnings: CanonicalWarningCode[] = [];
    for (const warning of [...torsoFrame.warnings, ...left.warnings, ...right.warnings]) {
        pushWarning(warnings, warning);
    }

    return {
        schemaVersion: CANONICAL_UPPER_BODY_SCHEMA_VERSION,
        timestamp: {
            mediaTimeMs: input.mediaTimeMs,
            poseLastUpdatedAtMs: input.pose.lastUpdatedAtMs,
        },
        torso: torsoFrame,
        arms: { left, right },
        calibration,
        warnings,
    };
}

function collectInputWarnings(options: {
    warnings: CanonicalWarningCode[];
    torsoFrame: CanonicalUpperBodyState["torso"];
    usedWorldFallback: boolean;
    invalidArmLength: boolean;
}): void {
    if (options.usedWorldFallback || options.invalidArmLength) {
        pushWarning(options.warnings, "missing_world_coordinates");
    }
    if (
        options.torsoFrame.confidence < FALLBACK_CONFIDENCE_MAX ||
        options.torsoFrame.warnings.includes("torso_frame_unreliable")
    ) {
        pushWarning(options.warnings, "torso_frame_unreliable");
    }
}

function normalizeDirection(
    value: readonly [number, number, number],
): readonly [number, number, number] {
    const vectorLength = length(value);
    if (vectorLength <= MIN_ARM_LENGTH) {
        return tuple3(0, 0, 0);
    }
    return tuple3(value[0] / vectorLength, value[1] / vectorLength, value[2] / vectorLength);
}

function calculateArmConfidence(options: {
    arm: SincroPoseArmMotionSnapshot;
    torsoConfidence: number;
    torsoWarnings: CanonicalWarningCode[];
    usedWorldFallback: boolean;
    invalidArmLength: boolean;
}): number {
    if (options.invalidArmLength) {
        return 0;
    }

    const baseConfidence = Math.min(
        clampConfidence(options.arm.confidence),
        minWorldConfidence(options.arm),
        clampConfidence(options.torsoConfidence),
    );
    const shouldClampConfidence =
        options.torsoConfidence < FALLBACK_CONFIDENCE_MAX ||
        options.torsoWarnings.includes("torso_frame_unreliable") ||
        options.usedWorldFallback ||
        options.arm.tracked === false ||
        hasLostJoint(options.arm);
    return clampConfidence(
        shouldClampConfidence ? Math.min(baseConfidence, FALLBACK_CONFIDENCE_MAX) : baseConfidence,
    );
}
