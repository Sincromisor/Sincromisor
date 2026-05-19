import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { SincroPoseRetargetConfig, SincroPoseRetargetFrame } from "./sincroPoseRetargetTypes";

type UpperBodyAnchor = SincroPoseRetargetFrame["anchor"];

type SincroPoseRetargetUpperBodyOptions = {
    snapshot: SincroPoseMotionSnapshot;
    config: SincroPoseRetargetConfig;
    anchor: UpperBodyAnchor;
    upperBodyWeight: number;
};

export function createSincroPoseUpperBodyFrame({
    snapshot,
    config,
    anchor,
    upperBodyWeight,
}: SincroPoseRetargetUpperBodyOptions): SincroPoseRetargetFrame["upperBody"] {
    return {
        spine: {
            x: 0,
            y: -snapshot.upperBody.torsoLean * config.torsoLeanRad * 0.45 * upperBodyWeight,
            z: -snapshot.upperBody.shoulderRoll * config.shoulderRollRad * 0.35 * upperBodyWeight,
        },
        chest: {
            x: 0,
            y:
                (-snapshot.upperBody.torsoLean * config.torsoLeanRad -
                    anchor.shoulderOffset.x * config.shoulderAnchorOffsetRad) *
                upperBodyWeight,
            z:
                (-snapshot.upperBody.shoulderRoll * config.shoulderRollRad -
                    anchor.shoulderOffset.y * config.shoulderAnchorOffsetRad) *
                upperBodyWeight,
        },
        leftShoulder: {
            x: 0,
            y: 0,
            z: -snapshot.upperBody.shoulderRoll * config.shoulderLiftRad * upperBodyWeight,
        },
        rightShoulder: {
            x: 0,
            y: 0,
            z: -snapshot.upperBody.shoulderRoll * config.shoulderLiftRad * upperBodyWeight,
        },
    };
}

export function createSincroPoseUpperBodyAnchor(
    snapshot: SincroPoseMotionSnapshot,
    config: SincroPoseRetargetConfig,
): UpperBodyAnchor {
    const leftShoulder = snapshot.leftArm.targets.shoulder;
    const rightShoulder = snapshot.rightArm.targets.shoulder;
    const shoulderTargetConfidence = Math.min(leftShoulder.confidence, rightShoulder.confidence);
    const targetConfidenceWeight = MathUtils.clamp(
        (shoulderTargetConfidence - config.minConfidence) /
            Math.max(1 - config.minConfidence, 0.01),
        0,
        1,
    );
    const widthWeight = MathUtils.clamp((snapshot.upperBody.shoulderWidth - 0.08) / 0.18, 0, 1);
    const hipWeight = snapshot.upperBody.hipCenterTracked ? 1 : 0.64;
    const weight = MathUtils.clamp(Math.min(targetConfidenceWeight, widthWeight) * hipWeight, 0, 1);
    const shoulderOffset = {
        x: MathUtils.clamp(snapshot.upperBody.shoulderCenterX - 0.5, -0.45, 0.45),
        y: MathUtils.clamp(snapshot.upperBody.shoulderCenterY - 0.38, -0.35, 0.35),
    };
    let reason = "shoulder_width_anchor";
    if (weight <= 0.18) {
        reason = "anchor_low_confidence";
    } else if (!snapshot.upperBody.hipCenterTracked) {
        reason = "hips_fallback_to_shoulders";
    }
    return {
        active: weight > 0.18,
        weight,
        reason,
        shoulderOffset,
    };
}
