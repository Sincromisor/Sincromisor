import type { SincroPoseArmMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { ReliabilityMap } from "../reliability/reliabilityMap";
import {
    clampConfidence,
    FALLBACK_CONFIDENCE_MAX,
    hasLostJoint,
    minWorldConfidence,
    pushWarning,
} from "./canonicalArmFeatureMath";
import type { CanonicalWarningCode } from "./canonicalUpperBodyState";

/** 生座標が欠ける腕は観測不可とし、体幹と関節の信頼性から観測信頼度を求める。 */
export function calculateArmConfidence(options: {
    arm: SincroPoseArmMotionSnapshot;
    torsoConfidence: number;
    torsoWarnings: CanonicalWarningCode[];
    usedWorldFallback: boolean;
    invalidArmLength: boolean;
    reliability?: CanonicalArmReliability;
}): number {
    if (options.invalidArmLength || options.usedWorldFallback) {
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

/** 左右の腕と三関節の信頼性を同じ側から取り出す。 */
export function resolveArmReliability(
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

/** 信頼性の低下理由を共通表現の警告へ集約する。 */
export function collectReliabilityWarnings(
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
