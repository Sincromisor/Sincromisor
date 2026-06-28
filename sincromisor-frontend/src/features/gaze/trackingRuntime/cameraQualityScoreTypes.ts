/**
 * `sincro.camera-quality.v1` の保存 contract と reason / threshold 定数を定義する。
 * 保存値は finite number、固定 enum、plain object に限定し、raw device id / label / permission object は contract に含めない。
 */
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type { TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

export const CAMERA_QUALITY_SCHEMA_VERSION = "sincro.camera-quality.v1" as const;

export type CameraQualityStatus = "good" | "warn" | "bad" | "unknown";

export type CameraQualityReasonCode =
    | "low_resolution"
    | "low_cadence"
    | "dropped_frames"
    | "torso_out_of_frame"
    | "torso_near_border"
    | "hand_out_of_frame"
    | "hand_near_border"
    | "hand_too_small"
    | "motion_blur_risk"
    | "track_not_live";

export type CameraQualityComponent = {
    score: number;
    status: CameraQualityStatus;
    reasonCodes: CameraQualityReasonCode[];
};

export type CameraQualityComponents = {
    resolution: CameraQualityComponent;
    cadence: CameraQualityComponent;
    torsoInFrame: CameraQualityComponent;
    handsInFrame: CameraQualityComponent;
    borderRisk: CameraQualityComponent;
    handSmallRisk: CameraQualityComponent;
    motionBlurRisk: CameraQualityComponent;
};

export type CameraQualityScore = {
    schemaVersion: typeof CAMERA_QUALITY_SCHEMA_VERSION;
    overall: { score: number; status: Exclude<CameraQualityStatus, "unknown"> };
    components: CameraQualityComponents;
    reasons: CameraQualityReasonCode[];
    guideMessages: {
        code: CameraQualityReasonCode;
        text: string;
        severity: "warn" | "bad";
    }[];
    track: {
        width?: number;
        height?: number;
        frameRate?: number;
        facingMode?: string;
        readyState?: MediaStreamTrackState;
    };
    sample: {
        mediaTimeMs?: number;
        clockSource?: string;
        droppedPresentedFrames?: number;
        presentationTimeMs?: number;
        expectedDisplayTimeMs?: number;
        presentedFrames?: number;
        videoCurrentTimeMs?: number;
        videoWidth: number;
        videoHeight: number;
        poseDetected: boolean;
        poseConfidence: number;
    };
};

export type CameraQualityPoseSample = {
    poseDetected: boolean;
    poseConfidence: number;
};

export type CreateCameraQualityScoreInput = {
    source: "camera" | "fixture";
    trackSettings?: MediaTrackSettings;
    trackReadyState?: MediaStreamTrackState;
    videoWidth: number;
    videoHeight: number;
    pose: SincroPoseMotionSnapshot;
    timing?: TrackerVideoFrameTiming;
    timingHistory: readonly TrackerVideoFrameTiming[];
    poseSamples: readonly CameraQualityPoseSample[];
};

export type CameraQualityComponentName = keyof CameraQualityComponents;

export const CAMERA_QUALITY_COMPONENT_SCORE: Record<CameraQualityStatus, number> = {
    good: 1,
    warn: 0.55,
    bad: 0,
    unknown: 0,
};

export const CAMERA_QUALITY_REASON_PRIORITY: CameraQualityReasonCode[] = [
    "torso_out_of_frame",
    "torso_near_border",
    "hand_out_of_frame",
    "hand_near_border",
    "hand_too_small",
    "motion_blur_risk",
    "low_resolution",
    "low_cadence",
    "dropped_frames",
    "track_not_live",
];

export const CAMERA_QUALITY_BORDER_MARGIN_WARN = 0.08;
export const CAMERA_QUALITY_BORDER_MARGIN_BAD = 0.04;
