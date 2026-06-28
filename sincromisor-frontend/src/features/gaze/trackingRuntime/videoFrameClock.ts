/**
 * requestVideoFrameCallback、RAF、timer fallback を同じ TrackerVideoFrameTiming contract へ正規化する clock。
 * rVFC 固有値が取れない環境では undefined を保持し、推論側が clock source を観測できるようにする。
 */
import type { TrackerVideoFrameTiming } from "./trackerRuntimeTypes";

const TIMER_FALLBACK_INTERVAL_MS = 200;

type VideoFrameClockCallback = (timing: TrackerVideoFrameTiming) => void;

type ScheduledRequest =
    | { source: "request-video-frame-callback"; id: number }
    | { source: "request-animation-frame"; id: number }
    | { source: "timer"; id: ReturnType<typeof globalThis.setTimeout> };

export class VideoFrameClock {
    private running = false;
    private scheduled?: ScheduledRequest;
    private previousPresentedFrames?: number;

    constructor(
        private readonly videoElement: HTMLVideoElement,
        private readonly onFrame: VideoFrameClockCallback,
    ) {}

    start(): void {
        this.running = true;
        this.requestNext();
    }

    stop(): void {
        this.running = false;
        this.cancelScheduled();
    }

    requestNext(): void {
        if (!this.running || this.scheduled !== undefined) {
            return;
        }
        if (typeof this.videoElement.requestVideoFrameCallback === "function") {
            const id = this.videoElement.requestVideoFrameCallback((receivedAtMs, metadata) => {
                this.scheduled = undefined;
                this.handleVideoFrameCallback(receivedAtMs, metadata);
            });
            this.scheduled = { source: "request-video-frame-callback", id };
            return;
        }
        if (typeof globalThis.requestAnimationFrame === "function") {
            const id = globalThis.requestAnimationFrame((receivedAtMs) => {
                this.scheduled = undefined;
                this.handleFallbackFrame("request-animation-frame", receivedAtMs);
            });
            this.scheduled = { source: "request-animation-frame", id };
            return;
        }
        const id = globalThis.setTimeout(() => {
            this.scheduled = undefined;
            this.handleFallbackFrame("timer", readPerformanceNowMs());
        }, TIMER_FALLBACK_INTERVAL_MS);
        this.scheduled = { source: "timer", id };
    }

    private handleVideoFrameCallback(
        receivedAtPerformanceMs: number,
        metadata: VideoFrameCallbackMetadata,
    ): void {
        if (!this.running) {
            return;
        }
        const presentedFrames = finiteNumberOrUndefined(metadata.presentedFrames);
        const timing: TrackerVideoFrameTiming = {
            source: "request-video-frame-callback",
            receivedAtPerformanceMs: finiteNumberOr(
                receivedAtPerformanceMs,
                readPerformanceNowMs(),
            ),
            mediaTimeMs: secondsToMs(metadata.mediaTime),
            videoCurrentTimeMs: secondsToMs(this.videoElement.currentTime),
            presentationTimeMs: finiteNumberOrUndefined(metadata.presentationTime),
            expectedDisplayTimeMs: finiteNumberOrUndefined(metadata.expectedDisplayTime),
            presentedFrames,
            droppedPresentedFrames: this.calculateDroppedPresentedFrames(presentedFrames),
        };
        this.onFrame(timing);
    }

    private handleFallbackFrame(
        source: "request-animation-frame" | "timer",
        receivedAtPerformanceMs: number,
    ): void {
        if (!this.running) {
            return;
        }
        const mediaTimeMs = secondsToMs(this.videoElement.currentTime);
        this.onFrame({
            source,
            receivedAtPerformanceMs: finiteNumberOr(
                receivedAtPerformanceMs,
                readPerformanceNowMs(),
            ),
            mediaTimeMs,
            videoCurrentTimeMs: mediaTimeMs,
            droppedPresentedFrames: 0,
        });
    }

    private calculateDroppedPresentedFrames(presentedFrames: number | undefined): number {
        if (presentedFrames === undefined) {
            return 0;
        }
        const previous = this.previousPresentedFrames;
        this.previousPresentedFrames = presentedFrames;
        if (previous === undefined) {
            return 0;
        }
        return Math.max(0, presentedFrames - previous - 1);
    }

    private cancelScheduled(): void {
        const scheduled = this.scheduled;
        this.scheduled = undefined;
        if (scheduled === undefined) {
            return;
        }
        if (scheduled.source === "request-video-frame-callback") {
            this.videoElement.cancelVideoFrameCallback(scheduled.id);
            return;
        }
        if (scheduled.source === "request-animation-frame") {
            if (typeof globalThis.cancelAnimationFrame === "function") {
                globalThis.cancelAnimationFrame(scheduled.id);
            }
            return;
        }
        globalThis.clearTimeout(scheduled.id);
    }
}

function secondsToMs(seconds: number): number {
    if (!Number.isFinite(seconds)) {
        return 0;
    }
    return seconds * 1000;
}

function finiteNumberOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

function finiteNumberOrUndefined(value: number | undefined): number | undefined {
    return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function readPerformanceNowMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        const nowMs = performance.now();
        if (Number.isFinite(nowMs)) {
            return nowMs;
        }
    }
    return Date.now();
}
