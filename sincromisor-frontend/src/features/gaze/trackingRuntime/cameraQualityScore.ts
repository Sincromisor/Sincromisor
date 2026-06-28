/**
 * pose / camera / frame timing から `sincro.camera-quality.v1` を生成する境界。
 * 出力は replay / motion-debug に保存できる plain object に限定し、MediaStreamTrack や browser permission object は保持しない。
 */
import { createCameraQualityGuideMessages } from "./cameraQualityGuideMessages";
import {
    cameraQualityComponentNames,
    collectCameraQualityReasons,
    evaluateCameraQualityComponents,
} from "./cameraQualityScoreComponents";
import {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityComponents,
    type CameraQualityScore,
    type CreateCameraQualityScoreInput,
} from "./cameraQualityScoreTypes";

export {
    CAMERA_QUALITY_SCHEMA_VERSION,
    type CameraQualityComponent,
    type CameraQualityComponents,
    type CameraQualityPoseSample,
    type CameraQualityReasonCode,
    type CameraQualityScore,
    type CameraQualityStatus,
    type CreateCameraQualityScoreInput,
} from "./cameraQualityScoreTypes";

export function createCameraQualityScore(input: CreateCameraQualityScoreInput): CameraQualityScore {
    const track = scrubTrackSettings(input.trackSettings, input.trackReadyState);
    const components = evaluateCameraQualityComponents(input, track);
    return {
        schemaVersion: CAMERA_QUALITY_SCHEMA_VERSION,
        overall: createOverall(components),
        components,
        reasons: collectCameraQualityReasons(components),
        guideMessages: createCameraQualityGuideMessages(components),
        track,
        sample: createSample(input),
    };
}

function scrubTrackSettings(
    settings: MediaTrackSettings | undefined,
    readyState: MediaStreamTrackState | undefined,
): CameraQualityScore["track"] {
    const track: CameraQualityScore["track"] = {};
    if (isFiniteNumber(settings?.width)) {
        track.width = settings.width;
    }
    if (isFiniteNumber(settings?.height)) {
        track.height = settings.height;
    }
    if (isFiniteNumber(settings?.frameRate)) {
        track.frameRate = settings.frameRate;
    }
    if (typeof settings?.facingMode === "string") {
        track.facingMode = settings.facingMode;
    }
    if (readyState !== undefined) {
        track.readyState = readyState;
    }
    return track;
}

function createSample(input: CreateCameraQualityScoreInput): CameraQualityScore["sample"] {
    const sample: CameraQualityScore["sample"] = {
        videoWidth: finiteOrZero(input.videoWidth),
        videoHeight: finiteOrZero(input.videoHeight),
        poseDetected: input.pose.detected,
        poseConfidence: finiteOrZero(input.pose.confidence),
    };
    const timing = input.timing;
    if (timing === undefined) {
        return sample;
    }
    sample.mediaTimeMs = timing.mediaTimeMs;
    sample.clockSource = timing.source;
    sample.droppedPresentedFrames = timing.droppedPresentedFrames;
    sample.presentationTimeMs = timing.presentationTimeMs;
    sample.expectedDisplayTimeMs = timing.expectedDisplayTimeMs;
    sample.presentedFrames = timing.presentedFrames;
    sample.videoCurrentTimeMs = timing.videoCurrentTimeMs;
    return sample;
}

function createOverall(components: CameraQualityComponents): CameraQualityScore["overall"] {
    const scores = cameraQualityComponentNames().map((name) => components[name].score);
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    const badCount = cameraQualityComponentNames().filter(
        (name) => components[name].status === "bad",
    ).length;
    if (score >= 0.8 && badCount === 0) {
        return { score, status: "good" };
    }
    if (score >= 0.45 && badCount <= 2) {
        return { score, status: "warn" };
    }
    return { score, status: "bad" };
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}
