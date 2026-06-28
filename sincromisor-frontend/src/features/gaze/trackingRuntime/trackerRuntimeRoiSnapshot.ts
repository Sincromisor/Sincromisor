/**
 * ROI 実行可否と skipped / paused snapshot を解決する純粋 helper 群。
 * Pose stale、ROI pause、fallback の reason code を stats / motion-debug に残し、crop object や MediaPipe raw result は扱わない。
 */
import type { SincroFaceMotionSnapshot } from "../faceTracking/sincroFaceMotionSnapshot";
import { createSincroHandFallbackSnapshot } from "../handTracking/sincroHandMotionSnapshot";
import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import { createFaceRoiFromPose } from "./roiTracking/roiCoordinateMapping";
import type { SincroTrackerRoiReasonCode, SincroTrackerRoiStats } from "./sincroTrackerWorkerTypes";
import type { TrackerRuntimeCallbacks, TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

const POSE_STALE_FOR_ROI_THRESHOLD_MS = 250;

export function resolveFreshTrackerPoseSnapshot(input: {
    nowMs: number;
    currentPose?: SincroPoseMotionSnapshot;
    latestPose?: SincroPoseMotionSnapshot;
}): SincroPoseMotionSnapshot | undefined {
    const pose = input.currentPose ?? input.latestPose;
    if (pose === undefined) {
        return undefined;
    }
    const lastUpdatedAtMs = pose.lastUpdatedAtMs;
    // ROI は Pose wrist/face region を正本にするため、古い Pose から crop を作らない。
    if (
        lastUpdatedAtMs === undefined ||
        input.nowMs - lastUpdatedAtMs > POSE_STALE_FOR_ROI_THRESHOLD_MS
    ) {
        return undefined;
    }
    return pose;
}

export function trackerPoseSnapshotIsFresh(
    nowMs: number,
    latestPose?: SincroPoseMotionSnapshot,
): boolean {
    return resolveFreshTrackerPoseSnapshot({ nowMs, latestPose }) !== undefined;
}

export function collectTrackerRoiSkipReasons(input: {
    handTrackingEnabled: boolean;
    faceRoiTrackingEnabled: boolean;
    handPaused: boolean;
    faceRoiPaused: boolean;
    runHand: boolean;
    runFaceRoi: boolean;
    hasFreshPoseSnapshot: boolean;
}): SincroTrackerRoiReasonCode[] {
    const reasons: SincroTrackerRoiReasonCode[] = [];
    if (input.handTrackingEnabled && !input.runHand) {
        reasons.push(resolveTrackerHandSkipReason(input.hasFreshPoseSnapshot, input.handPaused));
    }
    if (input.faceRoiTrackingEnabled && !input.runFaceRoi) {
        reasons.push(
            resolveTrackerFaceRoiSkipReason(input.hasFreshPoseSnapshot, input.faceRoiPaused),
        );
    }
    return reasons;
}

export function resolveTrackerHandSkipReason(
    hasFreshPoseSnapshot: boolean,
    handPaused: boolean,
): SincroTrackerRoiReasonCode {
    if (handPaused) {
        return "hand_roi_paused";
    }
    return hasFreshPoseSnapshot ? "hand_roi_skipped" : "pose_stale_for_roi";
}

export function resolveTrackerFaceRoiSkipReason(
    hasFreshPoseSnapshot: boolean,
    faceRoiPaused: boolean,
): SincroTrackerRoiReasonCode {
    if (faceRoiPaused) {
        return "face_roi_paused";
    }
    return hasFreshPoseSnapshot ? "face_roi_skipped" : "pose_stale_for_roi";
}

export function publishTrackerSkippedHandSnapshot(input: {
    callbacks?: TrackerRuntimeCallbacks;
    handTrackingEnabled: boolean;
    timing: TrackerVideoFrameTiming;
    reason: SincroTrackerRoiReasonCode;
}): void {
    if (!input.handTrackingEnabled || input.reason === "hand_roi_skipped") {
        return;
    }
    input.callbacks?.onHandMotion?.(
        createSincroHandFallbackSnapshot({
            reason: input.reason,
            nowMs: input.timing.mediaTimeMs,
        }),
        input.timing,
    );
}

export function mergeTrackerFaceRoiMetadata(input: {
    snapshot: SincroFaceMotionSnapshot;
    faceRoiSnapshot: SincroFaceMotionSnapshot;
}): SincroFaceMotionSnapshot {
    return {
        ...input.snapshot,
        roi: cloneTrackerFaceRoiObservation(input.faceRoiSnapshot.roi),
        warnings: uniqueStrings([...input.snapshot.warnings, ...input.faceRoiSnapshot.warnings]),
    };
}

export function withPausedTrackerFaceRoiWarning(input: {
    snapshot: SincroFaceMotionSnapshot;
    poseSnapshot?: SincroPoseMotionSnapshot;
}): SincroFaceMotionSnapshot {
    if (input.poseSnapshot === undefined) {
        return {
            ...input.snapshot,
            warnings: uniqueStrings([...input.snapshot.warnings, "face_roi_paused"]),
        };
    }
    const roi = createFaceRoiFromPose({ pose: input.poseSnapshot });
    return {
        ...input.snapshot,
        roi: {
            ...roi,
            rect: { ...roi.rect },
            referencePoint:
                roi.referencePoint === undefined
                    ? undefined
                    : [roi.referencePoint[0], roi.referencePoint[1]],
            warnings: uniqueStrings([...roi.warnings, "face_roi_paused"]),
        },
        warnings: uniqueStrings([...input.snapshot.warnings, "face_roi_paused"]),
    };
}

export function cloneTrackerRoiStats(stats: SincroTrackerRoiStats): SincroTrackerRoiStats {
    return {
        ...stats,
        reasonCodes: [...stats.reasonCodes],
    };
}

function cloneTrackerFaceRoiObservation(
    roi: SincroFaceMotionSnapshot["roi"],
): SincroFaceMotionSnapshot["roi"] {
    if (roi === undefined) {
        return undefined;
    }
    return {
        ...roi,
        rect: { ...roi.rect },
        referencePoint:
            roi.referencePoint === undefined
                ? undefined
                : [roi.referencePoint[0], roi.referencePoint[1]],
        warnings: [...roi.warnings],
    };
}

function uniqueStrings<T extends string>(values: T[]): T[] {
    return values.filter((value, index) => values.indexOf(value) === index);
}
