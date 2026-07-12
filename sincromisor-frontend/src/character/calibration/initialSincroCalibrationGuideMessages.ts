import type { InitialCalibrationRetryReason } from "./initialSincroCalibration";

const GUIDE_MESSAGE_BY_REASON: Record<InitialCalibrationRetryReason, string> = {
    camera_unavailable: "カメラを確認してください。",
    shoulders_out_of_frame: "肩まで画面に入るように、少し下がってください。",
    face_not_front: "正面を向いてください。",
    elbow_or_wrist_hidden: "肘と手が見えるようにしてください。",
    hand_not_visible: "手をカメラに見える位置へ移動してください。",
    too_dark: "部屋を明るくしてください。",
    motion_blur: "ゆっくり動くか、部屋を明るくしてください。",
    low_reliability: "姿勢をもう一度合わせてください。",
};

const RETRY_REASON_PRIORITY: InitialCalibrationRetryReason[] = [
    "camera_unavailable",
    "shoulders_out_of_frame",
    "face_not_front",
    "elbow_or_wrist_hidden",
    "hand_not_visible",
    "too_dark",
    "motion_blur",
    "low_reliability",
];

export function mapInitialCalibrationGuideMessages(
    reasons: readonly InitialCalibrationRetryReason[],
): string[] {
    const uniqueReasons = reasons.filter((reason, index) => reasons.indexOf(reason) === index);
    return RETRY_REASON_PRIORITY.filter((reason) => uniqueReasons.includes(reason))
        .slice(0, 2)
        .map((reason) => GUIDE_MESSAGE_BY_REASON[reason]);
}
