import { describe, expect, it } from "vitest";

import { resolveTrackerRuntimePerformanceProfile } from "../../../features/gaze/trackingRuntime/trackerRuntimePerformanceProfile";
import { createMotionDebugCameraConstraints } from "../motionDebugCameraStream";

describe("createMotionDebugCameraConstraints", () => {
    it("uses only ideal and max constraints for standard laptop", () => {
        const constraints = createMotionDebugCameraConstraints(
            resolveTrackerRuntimePerformanceProfile({
                performanceProfileId: "standard-laptop",
            }).profile,
        );

        const video = expectVideoConstraints(constraints);
        expect(video.width).toEqual({ ideal: 960 });
        expect(video.height).toEqual({ ideal: 540 });
        expect(video.frameRate).toEqual({ ideal: 24, max: 24 });
        expect(video.facingMode).toEqual({ ideal: "user" });
        expectNoExactOrMin(video.width);
        expectNoExactOrMin(video.height);
        expectNoExactOrMin(video.frameRate);
    });

    it("uses only ideal and max constraints for mobile Safari", () => {
        const constraints = createMotionDebugCameraConstraints(
            resolveTrackerRuntimePerformanceProfile({
                performanceProfileId: "mobile-safari",
            }).profile,
        );

        const video = expectVideoConstraints(constraints);
        expect(video.width).toEqual({ ideal: 640 });
        expect(video.height).toEqual({ ideal: 480 });
        expect(video.frameRate).toEqual({ ideal: 15, max: 15 });
        expect(video.facingMode).toEqual({ ideal: "user" });
        expectNoExactOrMin(video.width);
        expectNoExactOrMin(video.height);
        expectNoExactOrMin(video.frameRate);
    });
});

function expectVideoConstraints(constraints: MediaStreamConstraints): MediaTrackConstraints {
    if (typeof constraints.video !== "object" || constraints.video === null) {
        throw new Error("Expected video constraints object.");
    }
    expect(constraints.audio).toBe(false);
    return constraints.video;
}

function expectNoExactOrMin(value: unknown): void {
    if (typeof value !== "object" || value === null) {
        throw new Error("Expected constrain object.");
    }
    expect("exact" in value).toBe(false);
    expect("min" in value).toBe(false);
}
