import type { TrackerVideoFrameTiming } from "./trackerRuntimeTypes";
import { VideoFrameClock } from "./videoFrameClock";

export class TrackerRuntimeFrameLoop {
    private loopEnabled = false;
    private loopRunning = false;
    private clock?: VideoFrameClock;

    constructor(private readonly predict: (timing: TrackerVideoFrameTiming) => void) {}

    get enabled(): boolean {
        return this.loopEnabled;
    }

    enable(): void {
        this.loopEnabled = true;
    }

    startIfNeeded(videoElement: HTMLVideoElement, callbacks: unknown): void {
        if (!this.loopEnabled || this.loopRunning || !callbacks) {
            return;
        }
        if (videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            return;
        }
        this.loopRunning = true;
        this.clock = new VideoFrameClock(videoElement, (timing) => {
            if (!this.loopEnabled || !this.loopRunning) {
                return;
            }
            this.predict(timing);
        });
        this.clock.start();
    }

    stop(): void {
        this.loopEnabled = false;
        this.loopRunning = false;
        this.clock?.stop();
        this.clock = undefined;
    }

    schedule(): void {
        this.clock?.requestNext();
    }

    markStopped(): void {
        this.loopRunning = false;
        this.clock?.stop();
        this.clock = undefined;
    }
}
