/**
 * TrackerRuntime の detect loop を `VideoFrameClock` で駆動する lifecycle owner。
 *
 * rVFC、RAF、timer fallback の選択は `VideoFrameClock` に閉じ、この class は loop の二重起動と
 * 停止済み callback の再入を防ぐ。推論 pipeline、camera track、callback の cleanup は所有しない。
 */
import type { TrackerVideoFrameTiming } from "./trackerRuntimeTypes";
import { VideoFrameClock } from "./videoFrameClock";

/**
 * Hidden video element の frame clock と runtime 推論 callback の接続を管理する。
 *
 * `startIfNeeded()` は `enable()` 済みかつ video が `HAVE_CURRENT_DATA` 以上の場合だけ clock を作る。
 * `stop()` と `markStopped()` は idempotent で、二重解放時も古い clock へ次 frame を要求しない。
 */
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
