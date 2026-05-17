export class TrackerRuntimeFrameLoop {
    private loopEnabled = false;
    private loopRunning = false;
    private predictionFrameId?: number;

    constructor(private readonly predict: () => void) {}

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
        this.schedule();
    }

    stop(): void {
        this.loopEnabled = false;
        this.loopRunning = false;
        if (this.predictionFrameId !== undefined) {
            window.cancelAnimationFrame(this.predictionFrameId);
            this.predictionFrameId = undefined;
        }
    }

    schedule(): void {
        this.predictionFrameId = window.requestAnimationFrame(() => {
            this.predictionFrameId = undefined;
            this.predict();
        });
    }

    markStopped(): void {
        this.loopRunning = false;
    }
}
