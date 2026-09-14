import { expect, it, vi } from "vitest";
import { publishTrackerSkippedGestureSnapshot } from "../trackerRuntimeRoiSnapshot";
import type { TrackerVideoFrameTiming } from "../trackerRuntimeTypes";

it("要求なしでは通知せず、要求ありでは省略理由・有効状態・動画時刻を保つ", () => {
    const onGestureMotion = vi.fn();
    const timing: TrackerVideoFrameTiming = {
        source: "timer",
        receivedAtPerformanceMs: 999,
        mediaTimeMs: 123,
        videoCurrentTimeMs: 123,
        droppedPresentedFrames: 0,
    };
    const input = {
        callbacks: { onGestureMotion },
        gestureTrackingRequested: false,
        gestureTrackingEnabled: false,
        timing,
    };
    publishTrackerSkippedGestureSnapshot(input, "gesture_requires_pose_and_hand");
    expect(onGestureMotion).not.toHaveBeenCalled();
    for (const enabled of [false, true]) {
        publishTrackerSkippedGestureSnapshot(
            { ...input, gestureTrackingRequested: true, gestureTrackingEnabled: enabled },
            "gesture_pose_unavailable",
        );
        expect(onGestureMotion).toHaveBeenLastCalledWith(
            expect.objectContaining({
                source: "lost",
                trackingEnabled: enabled,
                lastUpdatedAtMs: 123,
                fallbackReason: "gesture_pose_unavailable",
                warnings: ["gesture_skipped"],
            }),
            timing,
        );
    }
    expect(onGestureMotion).toHaveBeenCalledTimes(2);
});
