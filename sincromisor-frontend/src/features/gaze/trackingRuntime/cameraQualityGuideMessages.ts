/**
 * CameraQualityScore の reason code を固定の案内文へ変換する UI 境界。
 * 自由文生成や device label の露出は持ち込まず、reason priority と表示文言の同期だけを担当する。
 */
import {
    CAMERA_QUALITY_REASON_PRIORITY,
    type CameraQualityComponents,
    type CameraQualityReasonCode,
    type CameraQualityScore,
} from "./cameraQualityScoreTypes";

const GUIDE_MESSAGE_LIMIT = 3;

const GUIDE_TEXT_BY_REASON: Record<CameraQualityReasonCode, string> = {
    torso_out_of_frame: "体を画面中央に入れてください",
    torso_near_border: "少し下がってください",
    hand_out_of_frame: "手が画面から出ないようにしてください",
    hand_near_border: "手が画面から出ないようにしてください",
    hand_too_small: "手が画面から出ないようにしてください",
    motion_blur_risk: "部屋を明るくしてください",
    low_resolution: "カメラ解像度を上げてください",
    low_cadence: "部屋を明るくしてください",
    dropped_frames: "部屋を明るくしてください",
    track_not_live: "部屋を明るくしてください",
};

type ReasonSeverity = {
    code: CameraQualityReasonCode;
    severity: "warn" | "bad";
};

export function createCameraQualityGuideMessages(
    components: CameraQualityComponents,
): CameraQualityScore["guideMessages"] {
    const severities = collectReasonSeverities(components);
    const byText: Record<string, ReasonSeverity> = {};
    for (const reason of CAMERA_QUALITY_REASON_PRIORITY) {
        const severity = severities.find((entry) => entry.code === reason)?.severity;
        if (severity === undefined) {
            continue;
        }
        const text = GUIDE_TEXT_BY_REASON[reason];
        const current = byText[text];
        if (current === undefined) {
            byText[text] = { code: reason, severity };
        } else if (severity === "bad") {
            byText[text] = { ...current, severity: "bad" };
        }
    }
    return CAMERA_QUALITY_REASON_PRIORITY.map((reason) => GUIDE_TEXT_BY_REASON[reason])
        .filter((text, index, array) => array.indexOf(text) === index)
        .map((text) => createGuideMessage(text, byText[text]))
        .filter(isGuideMessage)
        .slice(0, GUIDE_MESSAGE_LIMIT);
}

function collectReasonSeverities(components: CameraQualityComponents): ReasonSeverity[] {
    const severities: ReasonSeverity[] = [];
    for (const component of Object.values(components)) {
        if (component.status !== "warn" && component.status !== "bad") {
            continue;
        }
        for (const code of component.reasonCodes) {
            const existing = severities.find((entry) => entry.code === code);
            if (existing === undefined) {
                severities.push({ code, severity: component.status });
            } else if (component.status === "bad") {
                existing.severity = "bad";
            }
        }
    }
    return severities;
}

function createGuideMessage(
    text: string,
    entry: ReasonSeverity | undefined,
): CameraQualityScore["guideMessages"][number] | undefined {
    if (entry === undefined) {
        return undefined;
    }
    return {
        code: entry.code,
        text,
        severity: entry.severity,
    };
}

function isGuideMessage(
    value: CameraQualityScore["guideMessages"][number] | undefined,
): value is CameraQualityScore["guideMessages"][number] {
    return value !== undefined;
}
