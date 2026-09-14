/** 全画面代替の観測を左右へ一括割当する。ROI経路の左優先選択とは候補順位が異なる。 */
import type { SincroRoiObservation } from "../trackingRuntime/roiTracking/roiTrackingTypes";
import {
    distance2d,
    HAND_ASSIGNMENT_MAX_DISTANCE,
    HAND_TIE_EPSILON,
    lostHand,
    type SincroHandAssignmentResult,
    type SincroHandObservation,
    type SincroHandPoseWrist,
    sideSnapshotFromObservation,
} from "./sincroHandAssignmentSnapshot";
import type {
    SincroHandMotionSnapshot,
    SincroHandPoint2,
    SincroHandSource,
    SincroHandWarningCode,
} from "./sincroHandMotionSnapshot";

/** 距離→観測信頼度の順で候補を確定し、二重使用と同点で失った側へ警告を残す。 */
export function assignFullFrameObservationsToPose(input: {
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

// 各観測を近いPose手首へ対応付け、同距離では前回側→Pose信頼度→左の順で決める。
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

// 両側の前回値がある場合は近い側を選ぶ。片側だけの場合は0.08以内に限定する。
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
