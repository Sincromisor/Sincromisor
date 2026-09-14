/** 復元済みの観測をPose手首へ割り当てる。推論・座標復元の状態は所有しない。 */
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
import { assignFullFrameObservationsToPose } from "./sincroHandFullFrameAssignment";
import type {
    SincroHandMotionSnapshot,
    SincroHandPoint2,
    SincroHandSideSnapshot,
    SincroHandSource,
} from "./sincroHandMotionSnapshot";

/** 全画面代替は一括候補選択、それ以外は左→右の順で割り当て、同じ観測の二重使用を拒否する。 */
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

// ROI経路は距離順の先頭候補を選び、閾値・重複・同点を検査してから割当を確定する。
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

// 前回の左→右を0.08以内で優先する。同点解決の順序は全画面代替の経路とは異なる。
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
