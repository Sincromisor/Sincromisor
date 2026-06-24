import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoFrameClock } from "../videoFrameClock";

type FakeVideo = {
    video: HTMLVideoElement;
    setCurrentTime: (currentTime: number) => void;
};

function createFakeVideo(initialCurrentTime = 0): FakeVideo {
    let currentTime = initialCurrentTime;
    const video: HTMLVideoElement = Object.create(null);
    Object.defineProperty(video, "currentTime", {
        configurable: true,
        get: () => currentTime,
        set: (nextCurrentTime: number) => {
            currentTime = nextCurrentTime;
        },
    });
    return {
        video,
        setCurrentTime: (nextCurrentTime) => {
            currentTime = nextCurrentTime;
        },
    };
}

function createMetadata(mediaTime: number, presentedFrames: number): VideoFrameCallbackMetadata {
    return {
        expectedDisplayTime: 140,
        height: 720,
        mediaTime,
        presentationTime: 120,
        presentedFrames,
        width: 1280,
    };
}

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("VideoFrameClock", () => {
    it("emits rVFC timing with media time and dropped presented frames", () => {
        const { video } = createFakeVideo(1.2);
        const timings: unknown[] = [];
        let frameCallback: VideoFrameRequestCallback | undefined;
        Object.defineProperty(video, "requestVideoFrameCallback", {
            configurable: true,
            value: (callback: VideoFrameRequestCallback) => {
                frameCallback = callback;
                return 101;
            },
        });
        const cancelVideoFrameCallback = vi.fn();
        Object.defineProperty(video, "cancelVideoFrameCallback", {
            configurable: true,
            value: cancelVideoFrameCallback,
        });

        const clock = new VideoFrameClock(video, (timing) => {
            timings.push(timing);
        });
        clock.start();
        frameCallback?.(1000, createMetadata(1.2, 10));
        clock.requestNext();
        frameCallback?.(1033, createMetadata(1.233, 13));

        expect(timings).toEqual([
            {
                source: "request-video-frame-callback",
                receivedAtPerformanceMs: 1000,
                mediaTimeMs: 1200,
                videoCurrentTimeMs: 1200,
                presentationTimeMs: 120,
                expectedDisplayTimeMs: 140,
                presentedFrames: 10,
                droppedPresentedFrames: 0,
            },
            {
                source: "request-video-frame-callback",
                receivedAtPerformanceMs: 1033,
                mediaTimeMs: 1233,
                videoCurrentTimeMs: 1200,
                presentationTimeMs: 120,
                expectedDisplayTimeMs: 140,
                presentedFrames: 13,
                droppedPresentedFrames: 2,
            },
        ]);
        clock.stop();
        expect(cancelVideoFrameCallback).not.toHaveBeenCalled();
    });

    it("falls back to RAF timing without rVFC-only fields", () => {
        const { video, setCurrentTime } = createFakeVideo(2.5);
        const timings: unknown[] = [];
        let frameCallback: FrameRequestCallback | undefined;
        const cancelAnimationFrame = vi.fn();
        vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
            frameCallback = callback;
            return 7;
        });
        vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

        const clock = new VideoFrameClock(video, (timing) => {
            timings.push(timing);
        });
        clock.start();
        setCurrentTime(Number.NaN);
        frameCallback?.(2000);

        expect(timings).toEqual([
            {
                source: "request-animation-frame",
                receivedAtPerformanceMs: 2000,
                mediaTimeMs: 0,
                videoCurrentTimeMs: 0,
                droppedPresentedFrames: 0,
            },
        ]);
        clock.stop();
        expect(cancelAnimationFrame).not.toHaveBeenCalled();
    });

    it("uses a 5fps timer fallback when RAF is unavailable", () => {
        vi.useFakeTimers();
        const { video } = createFakeVideo(3);
        const timings: unknown[] = [];
        vi.stubGlobal("requestAnimationFrame", undefined);
        vi.stubGlobal("cancelAnimationFrame", undefined);
        vi.spyOn(performance, "now").mockReturnValue(3100);

        const clock = new VideoFrameClock(video, (timing) => {
            timings.push(timing);
        });
        clock.start();
        vi.advanceTimersByTime(199);
        expect(timings).toHaveLength(0);
        vi.advanceTimersByTime(1);

        expect(timings).toEqual([
            {
                source: "timer",
                receivedAtPerformanceMs: 3100,
                mediaTimeMs: 3000,
                videoCurrentTimeMs: 3000,
                droppedPresentedFrames: 0,
            },
        ]);
    });

    it("ignores delayed callbacks after stop", () => {
        const { video } = createFakeVideo(1);
        const onFrame = vi.fn();
        let frameCallback: VideoFrameRequestCallback | undefined;
        Object.defineProperty(video, "requestVideoFrameCallback", {
            configurable: true,
            value: (callback: VideoFrameRequestCallback) => {
                frameCallback = callback;
                return 1;
            },
        });
        Object.defineProperty(video, "cancelVideoFrameCallback", {
            configurable: true,
            value: vi.fn(),
        });

        const clock = new VideoFrameClock(video, onFrame);
        clock.start();
        clock.stop();
        frameCallback?.(100, createMetadata(1, 1));

        expect(onFrame).not.toHaveBeenCalled();
    });

    it("cancels pending timer callbacks on stop", () => {
        vi.useFakeTimers();
        const { video } = createFakeVideo(1);
        const onFrame = vi.fn();
        vi.stubGlobal("requestAnimationFrame", undefined);
        vi.stubGlobal("cancelAnimationFrame", undefined);

        const clock = new VideoFrameClock(video, onFrame);
        clock.start();
        clock.stop();
        vi.advanceTimersByTime(200);

        expect(onFrame).not.toHaveBeenCalled();
    });
});
