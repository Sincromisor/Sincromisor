import type { SincroFaceMotionSnapshot } from "../../features/gaze/faceTracking/sincroFaceMotionSnapshot";
import type {
    SincroPoseArmMotionSnapshot,
    SincroPoseMotionSnapshot,
} from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
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
import { extractCanonicalHeadState } from "./canonicalHeadFeatureExtractor";
import type { CanonicalTorsoFrameResult } from "./canonicalTorsoFrameEstimator";
import { length, subtract, tuple3 } from "./canonicalTuple3Math";
import {
    CANONICAL_UPPER_BODY_SCHEMA_VERSION,
    type CanonicalArmState,
    type CanonicalOutOfRangeField,
    type CanonicalUpperBodyState,
    type CanonicalWarningCode,
} from "./canonicalUpperBodyState";

/**
 * Pose callback 起点で canonical upper body state を生成する入力境界。
 *
 * Face は head pose の正本として optional に読み、previous は torso / Temporal 向け履歴を渡すための値である。
 * canonical layer 自体は missing head を previous で補わない。
 */
export type CanonicalArmFeatureInput = {
    pose: SincroPoseMotionSnapshot;
    face?: Pick<
        SincroFaceMotionSnapshot,
        "detected" | "confidence" | "headPose" | "source" | "warnings"
    >;
    torso: CanonicalTorsoFrameResult;
    previous?: CanonicalUpperBodyState;
    mediaTimeMs: number;
    reliability?: ReliabilityMap;
};

export type CanonicalSingleArmFeatureInput = {
    side: "left" | "right";
    arm: SincroPoseArmMotionSnapshot;
    torso: CanonicalTorsoFrameResult;
    reliability?: ReliabilityMap;
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

    const reliability = resolveArmReliability(input.reliability, input.side);
    const confidence = calculateArmConfidence({
        arm: input.arm,
        torsoConfidence: torsoFrame.confidence,
        torsoWarnings: torsoFrame.warnings,
        usedWorldFallback,
        invalidArmLength,
        reliability,
    });
    collectReliabilityWarnings(warnings, reliability);
    if (confidence < 0.15) {
        pushWarning(warnings, "low_confidence");
    }
    const lostReliability = reliability?.part.state === "lost";

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
        source:
            !lostReliability && confidence > 0 && input.arm.tracked && !invalidArmLength
                ? "pose"
                : "neutral",
        warnings,
        outOfRangeFields,
    };
}

/**
 * Pose / optional Face snapshot を後段共有の `CanonicalUpperBodyState` へ変換する。
 *
 * 戻り値は JSON 保存可能な finite scalar / tuple / enum だけを持ち、VRM pose、MediaPipe raw landmark、
 * matrix 全体、quaternion は保存しない。Face head が lost または信頼度不足の frame では `head` を省略し、
 * dropout / prediction は TemporalStateEstimator に委ねる。
 */
export function createCanonicalUpperBodyState(
    input: CanonicalArmFeatureInput,
): CanonicalUpperBodyState {
    const { torso: torsoFrame, calibration } = input.torso;
    const left = extractCanonicalArmState({
        side: "left",
        arm: input.pose.leftArm,
        torso: input.torso,
        reliability: input.reliability,
    });
    const right = extractCanonicalArmState({
        side: "right",
        arm: input.pose.rightArm,
        torso: input.torso,
        reliability: input.reliability,
    });
    const head = extractCanonicalHeadState({
        face: input.face,
        reliability: input.reliability,
        previous: input.previous?.head,
    });
    const warnings: CanonicalWarningCode[] = [];
    for (const warning of [
        ...torsoFrame.warnings,
        ...(head?.warnings ?? []),
        ...left.warnings,
        ...right.warnings,
    ]) {
        pushWarning(warnings, warning);
    }

    const state: CanonicalUpperBodyState = {
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
    if (head !== undefined) {
        state.head = head;
    }
    return state;
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
    reliability?: CanonicalArmReliability;
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
    const poseConfidence = clampConfidence(
        shouldClampConfidence ? Math.min(baseConfidence, FALLBACK_CONFIDENCE_MAX) : baseConfidence,
    );
    if (options.reliability === undefined) {
        return poseConfidence;
    }
    if (options.reliability.part.state === "lost") {
        return 0;
    }
    return clampConfidence(
        poseConfidence *
            Math.sqrt(options.reliability.partWeight * options.reliability.minJointWeight),
    );
}

type CanonicalArmReliability = {
    part: ReliabilityMap["parts"]["leftArm"];
    joints: ReliabilityMap["joints"]["leftShoulder"][];
    partWeight: number;
    minJointWeight: number;
};

function resolveArmReliability(
    reliability: ReliabilityMap | undefined,
    side: "left" | "right",
): CanonicalArmReliability | undefined {
    if (reliability === undefined) {
        return undefined;
    }
    const part = side === "left" ? reliability.parts.leftArm : reliability.parts.rightArm;
    const joints =
        side === "left"
            ? [
                  reliability.joints.leftShoulder,
                  reliability.joints.leftElbow,
                  reliability.joints.leftWrist,
              ]
            : [
                  reliability.joints.rightShoulder,
                  reliability.joints.rightElbow,
                  reliability.joints.rightWrist,
              ];
    const partWeight = clampConfidence(part.finalWeight);
    const minJointWeight = Math.min(...joints.map((joint) => clampConfidence(joint.finalWeight)));
    return {
        part,
        joints,
        partWeight,
        minJointWeight,
    };
}

function collectReliabilityWarnings(
    warnings: CanonicalWarningCode[],
    reliability: CanonicalArmReliability | undefined,
): void {
    if (reliability === undefined) {
        return;
    }
    if (reliability.partWeight < 0.35 || reliability.minJointWeight < 0.35) {
        pushWarning(warnings, "low_confidence");
    }
    const reasonSources = [
        reliability.part.components,
        ...reliability.joints.map((joint) => joint.components),
    ];
    if (
        reasonSources.some((components) =>
            components.side.reasonCodes.includes("side_inconsistent"),
        )
    ) {
        pushWarning(warnings, "left_right_swap_suspect");
    }
    if (
        reasonSources.some(
            (components) =>
                components.boneLength.reasonCodes.includes("bone_length_inconsistent") ||
                components.bodyScale.reasonCodes.includes("body_scale_jump"),
        )
    ) {
        pushWarning(warnings, "out_of_range");
    }
}
