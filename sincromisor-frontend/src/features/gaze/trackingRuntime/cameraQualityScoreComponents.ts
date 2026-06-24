import type {
    SincroPoseMotionSnapshot,
    SincroPoseTargetPointSnapshot,
} from "../poseTracking/sincroPoseMotionSnapshot";
import {
    type CameraQualityPointGroup,
    cameraPointDistance,
    evaluateCameraQualityPoint,
    posePointGroups,
} from "./cameraQualityGeometry";
import {
    CAMERA_QUALITY_BORDER_MARGIN_BAD,
    CAMERA_QUALITY_BORDER_MARGIN_WARN,
    CAMERA_QUALITY_COMPONENT_SCORE,
    CAMERA_QUALITY_REASON_PRIORITY,
    type CameraQualityComponent,
    type CameraQualityComponentName,
    type CameraQualityComponents,
    type CameraQualityPoseSample,
    type CameraQualityReasonCode,
    type CameraQualityScore,
    type CameraQualityStatus,
    type CreateCameraQualityScoreInput,
} from "./cameraQualityScoreTypes";
import type { TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

export function evaluateCameraQualityComponents(
    input: CreateCameraQualityScoreInput,
    track: CameraQualityScore["track"],
): CameraQualityComponents {
    const pointGroups = posePointGroups(input.pose);
    const cadence = evaluateCadence(input.timingHistory);
    return {
        resolution: evaluateResolution(input.source, track, input.videoWidth, input.videoHeight),
        cadence,
        torsoInFrame: evaluateInFrame(pointGroups.torso, "torso"),
        handsInFrame: evaluateInFrame(pointGroups.hands, "hands"),
        borderRisk: evaluateBorderRisk(pointGroups),
        handSmallRisk: evaluateHandSmallRisk(input.pose, pointGroups.hands),
        motionBlurRisk: evaluateMotionBlurRisk(track, cadence, input.poseSamples),
    };
}

export function collectCameraQualityReasons(
    components: CameraQualityComponents,
): CameraQualityReasonCode[] {
    const allReasons = cameraQualityComponentNames().flatMap(
        (name) => components[name].reasonCodes,
    );
    return CAMERA_QUALITY_REASON_PRIORITY.filter((reason) => allReasons.includes(reason));
}

export function cameraQualityComponentNames(): CameraQualityComponentName[] {
    return [
        "resolution",
        "cadence",
        "torsoInFrame",
        "handsInFrame",
        "borderRisk",
        "handSmallRisk",
        "motionBlurRisk",
    ];
}

function evaluateResolution(
    source: CreateCameraQualityScoreInput["source"],
    track: CameraQualityScore["track"],
    videoWidth: number,
    videoHeight: number,
): CameraQualityComponent {
    const width = track.width ?? (source === "fixture" ? videoWidth : undefined);
    const height = track.height ?? (source === "fixture" ? videoHeight : undefined);
    if (!isFiniteNumber(width) || !isFiniteNumber(height)) {
        return component("bad", ["low_resolution"]);
    }
    const pixels = width * height;
    if (pixels >= 1280 * 720) {
        return component("good", []);
    }
    if (pixels >= 640 * 480) {
        return component("warn", ["low_resolution"]);
    }
    return component("bad", ["low_resolution"]);
}

function evaluateCadence(
    timingHistory: readonly TrackerVideoFrameTiming[],
): CameraQualityComponent {
    const samples = timingHistory.slice(-30);
    if (samples.length < 5) {
        return component("unknown", []);
    }
    const intervals = mediaTimeIntervals(samples);
    if (intervals.length === 0) {
        return component("bad", ["low_cadence"]);
    }
    const medianIntervalMs = median(intervals);
    const medianFps = medianIntervalMs > 0 ? 1000 / medianIntervalMs : 0;
    const droppedFrames = samples.reduce((sum, timing) => sum + timing.droppedPresentedFrames, 0);
    const droppedFrameRate = droppedFrames / (intervals.length + droppedFrames);
    const reasonCodes: CameraQualityReasonCode[] =
        droppedFrameRate >= 0.08 ? ["dropped_frames"] : [];
    if (medianFps >= 12 && droppedFrameRate < 0.08) {
        return component("good", []);
    }
    if (medianFps >= 8 && droppedFrameRate < 0.2) {
        return component("warn", uniqueReasons(["low_cadence", ...reasonCodes]));
    }
    return component("bad", uniqueReasons(["low_cadence", ...reasonCodes]));
}

function evaluateInFrame(
    points: readonly SincroPoseTargetPointSnapshot[],
    group: "torso" | "hands",
): CameraQualityComponent {
    const reasonOut: CameraQualityReasonCode =
        group === "torso" ? "torso_out_of_frame" : "hand_out_of_frame";
    const reasonNear: CameraQualityReasonCode =
        group === "torso" ? "torso_near_border" : "hand_near_border";
    const evaluations = points.map(evaluateCameraQualityPoint);
    if (evaluations.some((result) => result.reason === "missing" || result.reason === "outside")) {
        return component("bad", [reasonOut]);
    }
    if (evaluations.some((result) => result.reason === "near")) {
        return component("warn", [reasonNear]);
    }
    return component("good", []);
}

function evaluateBorderRisk(groups: CameraQualityPointGroup): CameraQualityComponent {
    const torsoReasons = borderRiskReasons(groups.torso, "torso");
    const handReasons = borderRiskReasons(groups.hands, "hands");
    const allPoints = [...groups.torso, ...groups.hands];
    if (allPoints.every((point) => evaluateCameraQualityPoint(point).reason === "missing")) {
        return component("unknown", []);
    }
    const reasons = uniqueReasons([...torsoReasons.reasons, ...handReasons.reasons]);
    if (torsoReasons.status === "bad" || handReasons.status === "bad") {
        return component("bad", reasons);
    }
    if (torsoReasons.status === "warn" || handReasons.status === "warn") {
        return component("warn", reasons);
    }
    return component("good", []);
}

function borderRiskReasons(
    points: readonly SincroPoseTargetPointSnapshot[],
    group: "torso" | "hands",
): { status: Exclude<CameraQualityStatus, "unknown">; reasons: CameraQualityReasonCode[] } {
    const outReason: CameraQualityReasonCode =
        group === "torso" ? "torso_out_of_frame" : "hand_out_of_frame";
    const nearReason: CameraQualityReasonCode =
        group === "torso" ? "torso_near_border" : "hand_near_border";
    let status: Exclude<CameraQualityStatus, "unknown"> = "good";
    const reasons: CameraQualityReasonCode[] = [];
    for (const point of points) {
        const evaluation = evaluateCameraQualityPoint(point);
        if (evaluation.reason === "outside") {
            status = "bad";
            reasons.push(outReason);
        }
        if (
            evaluation.borderDistance !== undefined &&
            evaluation.borderDistance < CAMERA_QUALITY_BORDER_MARGIN_BAD
        ) {
            status = "bad";
            reasons.push(nearReason);
        } else if (
            status !== "bad" &&
            evaluation.borderDistance !== undefined &&
            evaluation.borderDistance < CAMERA_QUALITY_BORDER_MARGIN_WARN
        ) {
            status = "warn";
            reasons.push(nearReason);
        }
    }
    return { status, reasons: uniqueReasons(reasons) };
}

function evaluateHandSmallRisk(
    pose: SincroPoseMotionSnapshot,
    handPoints: readonly SincroPoseTargetPointSnapshot[],
): CameraQualityComponent {
    const armDistances = [
        cameraPointDistance(pose.leftArm.targets.elbow, pose.leftArm.targets.wrist),
        cameraPointDistance(pose.rightArm.targets.elbow, pose.rightArm.targets.wrist),
    ].filter(isFiniteNumber);
    const values =
        armDistances.length > 0
            ? armDistances
            : [pose.upperBody.shoulderWidth].filter(isFiniteNumber);
    if (
        values.length === 0 ||
        handPoints.every((point) => evaluateCameraQualityPoint(point).reason === "missing")
    ) {
        return component("bad", ["hand_too_small"]);
    }
    if (values.some((value) => value < 0.04)) {
        return component("bad", ["hand_too_small"]);
    }
    if (values.some((value) => value < 0.08)) {
        return component("warn", ["hand_too_small"]);
    }
    return component("good", []);
}

function evaluateMotionBlurRisk(
    track: CameraQualityScore["track"],
    cadence: CameraQualityComponent,
    poseSamples: readonly CameraQualityPoseSample[],
): CameraQualityComponent {
    const reasons: CameraQualityReasonCode[] = [];
    if (track.readyState !== undefined && track.readyState !== "live") {
        reasons.push("track_not_live");
    }
    if (cadence.status === "bad" || (track.frameRate !== undefined && track.frameRate < 8)) {
        reasons.push("motion_blur_risk");
        return component("bad", uniqueReasons(reasons));
    }
    if (track.frameRate !== undefined && track.frameRate < 10) {
        reasons.push("motion_blur_risk");
    }
    const lowConfidenceCount = poseSamples
        .slice(-10)
        .filter((sample) => sample.poseDetected && sample.poseConfidence < 0.25).length;
    if (lowConfidenceCount >= 6) {
        reasons.push("motion_blur_risk");
    }
    if (reasons.includes("track_not_live")) {
        return component("bad", uniqueReasons(reasons));
    }
    if (reasons.length > 0) {
        return component("warn", uniqueReasons(reasons));
    }
    return component("good", []);
}

function mediaTimeIntervals(samples: readonly TrackerVideoFrameTiming[]): number[] {
    const intervals: number[] = [];
    for (let index = 1; index < samples.length; index += 1) {
        const previous = samples[index - 1];
        const current = samples[index];
        if (previous === undefined || current === undefined) {
            continue;
        }
        const interval = current.mediaTimeMs - previous.mediaTimeMs;
        if (interval > 0 && Number.isFinite(interval)) {
            intervals.push(interval);
        }
    }
    return intervals;
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 1) {
        return sorted[middle] ?? 0;
    }
    return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function component(
    status: CameraQualityStatus,
    reasonCodes: CameraQualityReasonCode[],
): CameraQualityComponent {
    return {
        score: CAMERA_QUALITY_COMPONENT_SCORE[status],
        status,
        reasonCodes: uniqueReasons(reasonCodes),
    };
}

function uniqueReasons(reasonCodes: readonly CameraQualityReasonCode[]): CameraQualityReasonCode[] {
    return CAMERA_QUALITY_REASON_PRIORITY.filter((reason) => reasonCodes.includes(reason));
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}
