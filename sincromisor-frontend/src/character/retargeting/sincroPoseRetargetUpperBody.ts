import { MathUtils } from "three/src/math/MathUtils.js";
import type { SincroPoseMotionSnapshot } from "../../features/gaze/poseTracking/sincroPoseMotionSnapshot";
import type { AvatarMotionProfile } from "../avatarProfile/avatarMotionProfileTypes";
import type { SincroPoseRetargetConfig, SincroPoseRetargetFrame } from "./sincroPoseRetargetTypes";
import { createSincroPoseTorsoRotation } from "./sincroPoseTorsoRotation";

type UpperBodyAnchor = SincroPoseRetargetFrame["anchor"];

type SincroPoseRetargetUpperBodyOptions = {
    snapshot: SincroPoseMotionSnapshot;
    config: SincroPoseRetargetConfig;
    anchor: UpperBodyAnchor;
    upperBodyWeight: number;
    profile?: AvatarMotionProfile;
};

/** 肩・腰からの回転だけを返す。画面内の平行移動は姿勢へ混ぜない。 */
export function createSincroPoseUpperBodyFrame({
    snapshot,
    config,
    upperBodyWeight,
    profile,
}: SincroPoseRetargetUpperBodyOptions): SincroPoseRetargetFrame["upperBody"] {
    // 体幹回転は合成側で各ボーンへ一度だけ配分する。肩の追加回転は二重適用になるため行わない。
    const neutral = { x: 0, y: 0, z: 0 };
    return {
        spine: { ...neutral },
        chest: { ...neutral },
        leftShoulder: { ...neutral },
        rightShoulder: { ...neutral },
        torsoQuaternion: createSincroPoseTorsoRotation(
            snapshot,
            profile ? profile.torso.chestFollow * config.intensityScale : upperBodyWeight,
        ),
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
