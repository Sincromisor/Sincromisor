import type { Category, HandLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { mapCropPointToFullFrame } from "../trackingRuntime/roiTracking/roiCoordinateMapping";
import type {
    SincroRoiObservation,
    SincroRoiPoint,
    SincroRoiRect,
} from "../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    cloneSincroHandSideSnapshot,
    createLostHandSideSnapshot,
    type SincroHandFeatureSnapshot,
    type SincroHandMotionSnapshot,
    type SincroHandPoint2,
    type SincroHandSideSnapshot,
    type SincroHandSource,
    type SincroHandTuple3,
    type SincroHandWarningCode,
    uniqueHandWarnings,
} from "./sincroHandMotionSnapshot";

export type SincroHandLandmarkerLike = {
    detectForVideo(videoFrame: TexImageSource, timestampMs: number): HandLandmarkerResult;
    close(): void;
};

export type SincroHandLandmarkerInference = {
    result: HandLandmarkerResult;
    inferenceTimeMs: number;
    inferenceEndedAtMs: number;
};

type FullFrameHandLandmark = {
    x: number;
    y: number;
    z: number;
};

export type SincroHandObservation = {
    handIndex: number;
    wrist: SincroHandPoint2;
    confidence: number;
    handednessLabel?: string;
    handednessScore: number;
    features: SincroHandFeatureSnapshot;
    warnings: SincroHandWarningCode[];
};

export type SincroHandPoseWrist = {
    side: "left" | "right";
    point?: SincroHandPoint2;
    confidence: number;
};

export type SincroHandAssignmentResult = {
    leftHand: SincroHandSideSnapshot;
    rightHand: SincroHandSideSnapshot;
};

const HAND_LANDMARK = {
    wrist: 0,
    thumbCmc: 1,
    thumbMcp: 2,
    thumbIp: 3,
    thumbTip: 4,
    indexMcp: 5,
    indexPip: 6,
    indexDip: 7,
    indexTip: 8,
    middleMcp: 9,
    middlePip: 10,
    middleDip: 11,
    middleTip: 12,
    ringMcp: 13,
    ringPip: 14,
    ringDip: 15,
    ringTip: 16,
    littleMcp: 17,
    littlePip: 18,
    littleDip: 19,
    littleTip: 20,
};

const HAND_ASSIGNMENT_MAX_DISTANCE = 0.18;
const HAND_TIE_EPSILON = 1e-6;

export function runSincroHandLandmarker(input: {
    handLandmarker: SincroHandLandmarkerLike | undefined;
    videoFrame: TexImageSource;
    timestampMs: number;
}): SincroHandLandmarkerInference {
    const inferenceStartedAtMs = performance.now();
    const result = input.handLandmarker?.detectForVideo(input.videoFrame, input.timestampMs);
    const inferenceEndedAtMs = performance.now();
    if (result === undefined) {
        throw new Error("HandLandmarker model is not loaded.");
    }
    return {
        result,
        inferenceTimeMs: inferenceEndedAtMs - inferenceStartedAtMs,
        inferenceEndedAtMs,
    };
}

export function calculateHandInferenceFps(input: {
    lastInferenceEndedAtMs: number | undefined;
    inferenceEndedAtMs: number;
}): number {
    return input.lastInferenceEndedAtMs === undefined
        ? 0
        : 1000 / Math.max(1, input.inferenceEndedAtMs - input.lastInferenceEndedAtMs);
}

export function handRoiIsUsable(roi: SincroRoiObservation): boolean {
    return (
        roi.source === "pose-wrist" &&
        roi.confidence > 0 &&
        roi.rect.width > 0 &&
        roi.rect.height > 0
    );
}

export function restoreHandLandmarksToFullFrame(input: {
    landmarks: readonly NormalizedLandmark[];
    roi?: SincroRoiRect;
}): { landmarks: FullFrameHandLandmark[]; warnings: SincroHandWarningCode[] } | undefined {
    if (input.landmarks.length <= HAND_LANDMARK.littleTip) {
        return undefined;
    }
    const warnings: SincroHandWarningCode[] = [];
    const restored: FullFrameHandLandmark[] = [];
    for (const landmark of input.landmarks) {
        if (!Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
            addHandWarning(warnings, "landmarks_missing");
            restored.push({ x: 0, y: 0, z: 0 });
            continue;
        }
        const point = mapHandPointToFullFrame(input.roi, [landmark.x, landmark.y]);
        restored.push({
            x: point[0],
            y: point[1],
            z: Number.isFinite(landmark.z) ? landmark.z : 0,
        });
        if (!Number.isFinite(landmark.z)) {
            addHandWarning(warnings, "landmarks_missing");
        }
    }
    return { landmarks: restored, warnings };
}

export function normalizeSincroHandLandmarkerResult(input: {
    result: HandLandmarkerResult;
    roi?: SincroRoiObservation;
}): SincroHandObservation[] {
    const observations: SincroHandObservation[] = [];
    for (let handIndex = 0; handIndex < input.result.landmarks.length; handIndex += 1) {
        const landmarks = input.result.landmarks[handIndex];
        if (landmarks === undefined) {
            continue;
        }
        const restored = restoreHandLandmarksToFullFrame({
            landmarks,
            roi: input.roi?.rect,
        });
        if (restored === undefined) {
            continue;
        }
        const handedness = readHandedness(input.result.handedness[handIndex]);
        const confidence = clamp01(handedness.score);
        const warnings = uniqueHandWarnings([
            ...restored.warnings,
            ...handWarningsFromRoi(input.roi),
            ...confidenceWarnings(handedness.score, confidence),
        ]);
        observations.push({
            handIndex,
            wrist: landmarkPoint2(restored.landmarks[HAND_LANDMARK.wrist]),
            confidence,
            handednessLabel: handedness.label,
            handednessScore: confidence,
            features: createSincroHandFeatureSnapshot({
                landmarks: restored.landmarks,
                confidence,
                landmarksMissing: warnings.includes("landmarks_missing"),
            }),
            warnings,
        });
    }
    return observations;
}

export function assignSincroHandObservationsToPose(input: {
    observations: readonly SincroHandObservation[];
    leftWrist: SincroHandPoseWrist;
    rightWrist: SincroHandPoseWrist;
    source: SincroHandSource;
    roi?: SincroRoiObservation;
    previous?: SincroHandMotionSnapshot;
}): SincroHandAssignmentResult {
    if (input.source === "full-frame-fallback") {
        return assignFullFrameObservationsToPose(input);
    }
    const assigned = new Map<number, "left" | "right">();
    const leftHand = selectObservationForSide({
        side: "left",
        wrist: input.leftWrist,
        observations: input.observations,
        assigned,
        source: input.source,
        roi: input.roi,
        previous: input.previous,
    });
    const rightHand = selectObservationForSide({
        side: "right",
        wrist: input.rightWrist,
        observations: input.observations,
        assigned,
        source: input.source,
        roi: input.roi,
        previous: input.previous,
    });
    return { leftHand, rightHand };
}

function assignFullFrameObservationsToPose(input: {
    observations: readonly SincroHandObservation[];
    leftWrist: SincroHandPoseWrist;
    rightWrist: SincroHandPoseWrist;
    source: SincroHandSource;
    roi?: SincroRoiObservation;
    previous?: SincroHandMotionSnapshot;
}): SincroHandAssignmentResult {
    const candidates = input.observations
        .map((observation) =>
            createFullFrameCandidate({
                observation,
                leftWrist: input.leftWrist,
                rightWrist: input.rightWrist,
                previous: input.previous,
            }),
        )
        .filter((candidate) => candidate !== undefined)
        .sort((left, right) => {
            if (left.distance !== right.distance) {
                return left.distance - right.distance;
            }
            return right.observation.confidence - left.observation.confidence;
        });
    const assigned = new Map<"left" | "right", SincroHandObservation>();
    const usedHandIndexes = new Set<number>();
    const duplicateSides = new Set<"left" | "right">();
    for (const candidate of candidates) {
        if (usedHandIndexes.has(candidate.observation.handIndex)) {
            duplicateSides.add(candidate.side);
            continue;
        }
        if (assigned.has(candidate.side)) {
            duplicateSides.add(candidate.side);
            continue;
        }
        assigned.set(candidate.side, candidate.observation);
        usedHandIndexes.add(candidate.observation.handIndex);
        if (candidate.tieRejectedSide !== undefined) {
            duplicateSides.add(candidate.tieRejectedSide);
        }
    }
    return {
        leftHand: assigned.has("left")
            ? sideSnapshotFromObservation({
                  observation: readAssignedObservation(assigned, "left"),
                  side: "left",
                  source: input.source,
                  roi: input.roi,
              })
            : lostHand(
                  "left",
                  input.roi,
                  fullFrameLostWarnings(input.observations, duplicateSides, "left"),
              ),
        rightHand: assigned.has("right")
            ? sideSnapshotFromObservation({
                  observation: readAssignedObservation(assigned, "right"),
                  side: "right",
                  source: input.source,
                  roi: input.roi,
              })
            : lostHand(
                  "right",
                  input.roi,
                  fullFrameLostWarnings(input.observations, duplicateSides, "right"),
              ),
    };
}

function createFullFrameCandidate(input: {
    observation: SincroHandObservation;
    leftWrist: SincroHandPoseWrist;
    rightWrist: SincroHandPoseWrist;
    previous?: SincroHandMotionSnapshot;
}):
    | {
          observation: SincroHandObservation;
          side: "left" | "right";
          distance: number;
          tieRejectedSide?: "left" | "right";
      }
    | undefined {
    const leftDistance =
        input.leftWrist.point === undefined
            ? undefined
            : distance2d(input.observation.wrist, input.leftWrist.point);
    const rightDistance =
        input.rightWrist.point === undefined
            ? undefined
            : distance2d(input.observation.wrist, input.rightWrist.point);
    const leftValid = leftDistance !== undefined && leftDistance <= HAND_ASSIGNMENT_MAX_DISTANCE;
    const rightValid = rightDistance !== undefined && rightDistance <= HAND_ASSIGNMENT_MAX_DISTANCE;
    if (!leftValid && !rightValid) {
        return undefined;
    }
    if (leftValid && !rightValid && leftDistance !== undefined) {
        return { observation: input.observation, side: "left", distance: leftDistance };
    }
    if (rightValid && !leftValid && rightDistance !== undefined) {
        return { observation: input.observation, side: "right", distance: rightDistance };
    }
    if (leftDistance === undefined || rightDistance === undefined) {
        return undefined;
    }
    if (Math.abs(leftDistance - rightDistance) > HAND_TIE_EPSILON) {
        return leftDistance < rightDistance
            ? { observation: input.observation, side: "left", distance: leftDistance }
            : { observation: input.observation, side: "right", distance: rightDistance };
    }
    const preferredSide =
        preferredTieSideForFullFrame({
            observation: input.observation,
            previous: input.previous,
            leftWrist: input.leftWrist,
            rightWrist: input.rightWrist,
        }) ?? "left";
    return {
        observation: input.observation,
        side: preferredSide,
        distance: preferredSide === "left" ? leftDistance : rightDistance,
        tieRejectedSide: preferredSide === "left" ? "right" : "left",
    };
}

function preferredTieSideForFullFrame(input: {
    observation: SincroHandObservation;
    previous: SincroHandMotionSnapshot | undefined;
    leftWrist: SincroHandPoseWrist;
    rightWrist: SincroHandPoseWrist;
}): "left" | "right" | undefined {
    const previousSide = previousSideForObservation(input.previous, input.observation.wrist);
    if (previousSide !== undefined) {
        return previousSide;
    }
    if (input.leftWrist.confidence > input.rightWrist.confidence) {
        return "left";
    }
    if (input.rightWrist.confidence > input.leftWrist.confidence) {
        return "right";
    }
    return undefined;
}

function previousSideForObservation(
    previous: SincroHandMotionSnapshot | undefined,
    point: SincroHandPoint2,
): "left" | "right" | undefined {
    const leftDistance =
        previous?.leftHand.detected && previous.leftHand.fullFrameWrist !== undefined
            ? distance2d(previous.leftHand.fullFrameWrist, point)
            : undefined;
    const rightDistance =
        previous?.rightHand.detected && previous.rightHand.fullFrameWrist !== undefined
            ? distance2d(previous.rightHand.fullFrameWrist, point)
            : undefined;
    if (leftDistance !== undefined && rightDistance !== undefined) {
        return leftDistance <= rightDistance ? "left" : "right";
    }
    if (leftDistance !== undefined && leftDistance <= 0.08) {
        return "left";
    }
    if (rightDistance !== undefined && rightDistance <= 0.08) {
        return "right";
    }
    return undefined;
}

function readAssignedObservation(
    assigned: Map<"left" | "right", SincroHandObservation>,
    side: "left" | "right",
): SincroHandObservation {
    const observation = assigned.get(side);
    if (observation === undefined) {
        throw new Error(`Assigned ${side} hand is missing.`);
    }
    return observation;
}

function fullFrameLostWarnings(
    observations: readonly SincroHandObservation[],
    duplicateSides: ReadonlySet<"left" | "right">,
    side: "left" | "right",
): SincroHandWarningCode[] {
    if (duplicateSides.has(side)) {
        return ["duplicate_assignment"];
    }
    return observations.length === 0 ? [] : ["side_inconsistent"];
}

export function createSincroHandFeatureSnapshot(input: {
    landmarks: readonly FullFrameHandLandmark[];
    confidence: number;
    landmarksMissing: boolean;
}): SincroHandFeatureSnapshot {
    const palmSize = Math.max(
        distance3d(input.landmarks[HAND_LANDMARK.wrist], input.landmarks[HAND_LANDMARK.middleMcp]),
        0.001,
    );
    const fingerCurl = {
        thumb: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.thumbMcp,
            HAND_LANDMARK.thumbTip,
            palmSize,
        ),
        index: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.indexMcp,
            HAND_LANDMARK.indexTip,
            palmSize,
        ),
        middle: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.middleMcp,
            HAND_LANDMARK.middleTip,
            palmSize,
        ),
        ring: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.ringMcp,
            HAND_LANDMARK.ringTip,
            palmSize,
        ),
        little: calculateFingerCurl(
            input.landmarks,
            HAND_LANDMARK.littleMcp,
            HAND_LANDMARK.littleTip,
            palmSize,
        ),
    };
    return {
        palmNormal: palmNormal(input.landmarks),
        palmDirection: palmDirection(input.landmarks),
        fingerCurl,
        fingerSplay: {
            indexMiddle: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.indexMcp,
                HAND_LANDMARK.middleMcp,
            ),
            middleRing: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.middleMcp,
                HAND_LANDMARK.ringMcp,
            ),
            ringLittle: fingerSplay(
                input.landmarks,
                HAND_LANDMARK.ringMcp,
                HAND_LANDMARK.littleMcp,
            ),
        },
        thumbOppose: thumbOppose(input.landmarks, palmSize),
        openness: determineSincroHandOpenness({
            fingerCurl,
            confidence: input.confidence,
            landmarksMissing: input.landmarksMissing,
        }),
    };
}

export function determineSincroHandOpenness(input: {
    fingerCurl: Pick<SincroHandFeatureSnapshot, "fingerCurl">["fingerCurl"];
    confidence: number;
    landmarksMissing?: boolean;
}): SincroHandFeatureSnapshot["openness"] {
    if (input.landmarksMissing || input.confidence < 0.2) {
        return "unknown";
    }
    const averageCurl =
        (input.fingerCurl.index +
            input.fingerCurl.middle +
            input.fingerCurl.ring +
            input.fingerCurl.little) /
        4;
    if (averageCurl <= 0.35) {
        return "open";
    }
    if (averageCurl < 0.72) {
        return "half";
    }
    return "closed";
}

export function handWarningsFromRoi(
    roi: SincroRoiObservation | undefined,
): SincroHandWarningCode[] {
    if (roi === undefined) {
        return [];
    }
    const warnings: SincroHandWarningCode[] = [];
    if (roi.warnings.includes("roi_missing") || roi.source === "none") {
        warnings.push("roi_missing");
    }
    if (roi.warnings.includes("roi_inconsistent")) {
        warnings.push("roi_inconsistent");
    }
    return warnings;
}

function selectObservationForSide(input: {
    side: "left" | "right";
    wrist: SincroHandPoseWrist;
    observations: readonly SincroHandObservation[];
    assigned: Map<number, "left" | "right">;
    source: SincroHandSource;
    roi?: SincroRoiObservation;
    previous?: SincroHandMotionSnapshot;
}): SincroHandSideSnapshot {
    if (input.wrist.point === undefined || input.observations.length === 0) {
        return lostHand(
            input.side,
            input.roi,
            input.observations.length === 0 ? [] : ["roi_missing"],
        );
    }
    const candidates = rankedCandidates(input.observations, input.wrist.point);
    const best = candidates[0];
    if (best === undefined || best.distance > HAND_ASSIGNMENT_MAX_DISTANCE) {
        return lostHand(input.side, input.roi, best === undefined ? [] : ["side_inconsistent"]);
    }
    if (input.assigned.has(best.observation.handIndex)) {
        return lostHand(input.side, input.roi, ["duplicate_assignment"]);
    }
    if (isAmbiguousTie(candidates)) {
        const preferredSide = preferredTieSide({
            observation: best.observation,
            previous: input.previous,
            leftWrist: input.side === "left" ? input.wrist : undefined,
            rightWrist: input.side === "right" ? input.wrist : undefined,
        });
        if (preferredSide !== undefined && preferredSide !== input.side) {
            return lostHand(input.side, input.roi, ["duplicate_assignment"]);
        }
    }
    input.assigned.set(best.observation.handIndex, input.side);
    return sideSnapshotFromObservation({
        observation: best.observation,
        side: input.side,
        source: input.source,
        roi: input.roi,
    });
}

function rankedCandidates(
    observations: readonly SincroHandObservation[],
    wrist: SincroHandPoint2,
): { observation: SincroHandObservation; distance: number }[] {
    return observations
        .map((observation) => ({
            observation,
            distance: distance2d(observation.wrist, wrist),
        }))
        .sort((left, right) => left.distance - right.distance);
}

function isAmbiguousTie(
    candidates: readonly { observation: SincroHandObservation; distance: number }[],
): boolean {
    const first = candidates[0];
    const second = candidates[1];
    if (first === undefined || second === undefined) {
        return false;
    }
    return Math.abs(first.distance - second.distance) <= HAND_TIE_EPSILON;
}

function preferredTieSide(input: {
    observation: SincroHandObservation;
    previous: SincroHandMotionSnapshot | undefined;
    leftWrist: SincroHandPoseWrist | undefined;
    rightWrist: SincroHandPoseWrist | undefined;
}): "left" | "right" | undefined {
    const previous = input.previous;
    if (previous?.leftHand.detected && previous.leftHand.fullFrameWrist !== undefined) {
        const leftDistance = distance2d(previous.leftHand.fullFrameWrist, input.observation.wrist);
        if (leftDistance <= 0.08) {
            return "left";
        }
    }
    if (previous?.rightHand.detected && previous.rightHand.fullFrameWrist !== undefined) {
        const rightDistance = distance2d(
            previous.rightHand.fullFrameWrist,
            input.observation.wrist,
        );
        if (rightDistance <= 0.08) {
            return "right";
        }
    }
    if (input.leftWrist !== undefined && input.rightWrist !== undefined) {
        if (input.leftWrist.confidence > input.rightWrist.confidence) {
            return "left";
        }
        if (input.rightWrist.confidence > input.leftWrist.confidence) {
            return "right";
        }
    }
    return undefined;
}

function sideSnapshotFromObservation(input: {
    observation: SincroHandObservation;
    side: "left" | "right";
    source: SincroHandSource;
    roi?: SincroRoiObservation;
}): SincroHandSideSnapshot {
    return {
        detected: true,
        assignedSide: input.side,
        source: input.source,
        confidence: input.observation.confidence,
        handednessLabel: input.observation.handednessLabel,
        handednessScore: input.observation.handednessScore,
        roi: input.roi,
        fullFrameWrist: input.observation.wrist,
        features: input.observation.features,
        warnings: input.observation.warnings,
    };
}

function lostHand(
    side: "left" | "right",
    roi: SincroRoiObservation | undefined,
    warnings: SincroHandWarningCode[],
): SincroHandSideSnapshot {
    return {
        ...cloneSincroHandSideSnapshot(
            createLostHandSideSnapshot(side, [
                "landmarks_missing",
                ...handWarningsFromRoi(roi),
                ...warnings,
            ]),
        ),
        roi,
    };
}

function readHandedness(categories: Category[] | undefined): {
    label?: string;
    score: number;
} {
    const category = categories?.[0];
    return {
        label: category?.categoryName || undefined,
        score: category?.score ?? 0,
    };
}

function confidenceWarnings(rawScore: number, confidence: number): SincroHandWarningCode[] {
    return !Number.isFinite(rawScore) || confidence < 0.2 ? ["low_confidence"] : [];
}

function mapHandPointToFullFrame(
    roi: SincroRoiRect | undefined,
    point: SincroRoiPoint,
): SincroRoiPoint {
    return roi === undefined ? point : mapCropPointToFullFrame(roi, point);
}

function palmDirection(landmarks: readonly FullFrameHandLandmark[]): SincroHandTuple3 {
    return normalizeTuple3(
        vector3(landmarks[HAND_LANDMARK.wrist], landmarks[HAND_LANDMARK.middleMcp]),
        [0, -1, 0],
    );
}

function palmNormal(landmarks: readonly FullFrameHandLandmark[]): SincroHandTuple3 {
    const wrist = landmarks[HAND_LANDMARK.wrist];
    const index = landmarks[HAND_LANDMARK.indexMcp];
    const little = landmarks[HAND_LANDMARK.littleMcp];
    const indexVector = vector3(wrist, index);
    const littleVector = vector3(wrist, little);
    return normalizeTuple3(cross(indexVector, littleVector), [0, 0, 1]);
}

function calculateFingerCurl(
    landmarks: readonly FullFrameHandLandmark[],
    mcpIndex: number,
    tipIndex: number,
    palmSize: number,
): number {
    return clamp01(1 - distance3d(landmarks[mcpIndex], landmarks[tipIndex]) / (palmSize * 1.6));
}

function fingerSplay(
    landmarks: readonly FullFrameHandLandmark[],
    firstMcpIndex: number,
    secondMcpIndex: number,
): number {
    const wrist = landmarks[HAND_LANDMARK.wrist];
    const first = normalizeTuple3(vector3(wrist, landmarks[firstMcpIndex]), [0, 0, 0]);
    const second = normalizeTuple3(vector3(wrist, landmarks[secondMcpIndex]), [0, 0, 0]);
    const dot = clamp(dot3(first, second), -1, 1);
    return clamp01(Math.acos(dot) / (Math.PI / 3));
}

function thumbOppose(landmarks: readonly FullFrameHandLandmark[], palmSize: number): number {
    const thumbTip = landmarks[HAND_LANDMARK.thumbTip];
    const littleMcp = landmarks[HAND_LANDMARK.littleMcp];
    return clamp01(1 - distance3d(thumbTip, littleMcp) / (palmSize * 2));
}

function landmarkPoint2(landmark: FullFrameHandLandmark | undefined): SincroHandPoint2 {
    if (landmark === undefined) {
        return [0, 0];
    }
    return [clamp01(landmark.x), clamp01(landmark.y)];
}

function vector3(
    from: FullFrameHandLandmark | undefined,
    to: FullFrameHandLandmark | undefined,
): SincroHandTuple3 {
    if (from === undefined || to === undefined) {
        return [0, 0, 0];
    }
    return [finiteOrZero(to.x - from.x), finiteOrZero(to.y - from.y), finiteOrZero(to.z - from.z)];
}

function cross(left: SincroHandTuple3, right: SincroHandTuple3): SincroHandTuple3 {
    return [
        left[1] * right[2] - left[2] * right[1],
        left[2] * right[0] - left[0] * right[2],
        left[0] * right[1] - left[1] * right[0],
    ];
}

function normalizeTuple3(value: SincroHandTuple3, fallback: SincroHandTuple3): SincroHandTuple3 {
    const length = Math.hypot(value[0], value[1], value[2]);
    if (!Number.isFinite(length) || length <= 0) {
        return fallback;
    }
    return [value[0] / length, value[1] / length, value[2] / length];
}

function distance2d(left: SincroHandPoint2, right: SincroHandPoint2): number {
    return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function distance3d(
    left: FullFrameHandLandmark | undefined,
    right: FullFrameHandLandmark | undefined,
): number {
    if (left === undefined || right === undefined) {
        return 0;
    }
    return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function dot3(left: SincroHandTuple3, right: SincroHandTuple3): number {
    return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

function clamp01(value: number): number {
    return clamp(Number.isFinite(value) ? value : 0, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

function addHandWarning(warnings: SincroHandWarningCode[], warning: SincroHandWarningCode): void {
    if (!warnings.includes(warning)) {
        warnings.push(warning);
    }
}
