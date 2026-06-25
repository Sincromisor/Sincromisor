import {
    ONLINE_CALIBRATION_FACE_YAW_NEUTRAL_LIMIT_RAD,
    type OnlineCalibrationFreezeReason,
    type OnlineCalibrationGateInput,
    type OnlineCalibrationGateResult,
    type OnlineCalibrationSample,
} from "./onlineSincroCalibrationTypes";

export function evaluateOnlineCalibrationGate(
    input: OnlineCalibrationGateInput | OnlineCalibrationSample,
): OnlineCalibrationGateResult {
    const gate = "gate" in input ? input.gate : input;
    const freezeReasons: OnlineCalibrationFreezeReason[] = [];
    if (gate.torsoReliability <= 0.85) freezeReasons.push("torso_low_reliability");
    if (gate.headReliability <= 0.8) freezeReasons.push("head_low_reliability");
    if (!gate.bothShouldersVisible) freezeReasons.push("shoulders_not_visible");
    if (gate.borderRisk >= 0.3) freezeReasons.push("border_risk");
    if (gate.motionBlurRisk >= 0.5) freezeReasons.push("motion_blur");
    if (gate.armActivity >= 0.2) freezeReasons.push("arm_activity_high");
    if (gate.faceYawAbsRad >= ONLINE_CALIBRATION_FACE_YAW_NEUTRAL_LIMIT_RAD) {
        freezeReasons.push("face_yaw_not_neutral");
    }
    if (gate.boneLengthConsistency <= 0.8) freezeReasons.push("bone_length_inconsistent");
    return { open: freezeReasons.length === 0, freezeReasons };
}
