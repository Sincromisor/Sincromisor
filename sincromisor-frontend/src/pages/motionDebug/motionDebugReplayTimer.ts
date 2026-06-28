import type {
    MotionDebugReplayFrameResult,
    MotionDebugReplayState,
    MotionDebugStatus,
} from "./types";

type MotionDebugReplayTimerParams = {
    frameCount: () => number;
    frameMediaTimeMs: (frameIndex: number) => number | undefined;
    stepReplay: (frameIndex: number) => MotionDebugReplayFrameResult;
    stopReplay: () => MotionDebugReplayState;
    setStatus: (status: MotionDebugStatus, message: string) => void;
    renderSnapshot: () => void;
};

export class MotionDebugReplayTimer {
    private timerId?: number;

    constructor(private readonly params: MotionDebugReplayTimerParams) {}

    scheduleNextFrame(currentFrameIndex: number): void {
        const nextFrameIndex = currentFrameIndex + 1;
        if (nextFrameIndex >= this.params.frameCount()) {
            this.params.stopReplay();
            return;
        }
        const currentMediaTimeMs = this.params.frameMediaTimeMs(currentFrameIndex);
        const nextMediaTimeMs = this.params.frameMediaTimeMs(nextFrameIndex);
        const delayMs =
            currentMediaTimeMs === undefined || nextMediaTimeMs === undefined
                ? 0
                : Math.max(0, nextMediaTimeMs - currentMediaTimeMs);
        this.timerId = window.setTimeout(() => {
            const result = this.params.stepReplay(nextFrameIndex);
            this.updateReplayStatus(result, true);
            this.params.renderSnapshot();
            if (result.ok) {
                this.scheduleNextFrame(result.frameIndex);
            }
        }, delayMs);
    }

    clear(): void {
        if (this.timerId === undefined) {
            return;
        }
        window.clearTimeout(this.timerId);
        this.timerId = undefined;
    }

    updateReplayStatus(result: MotionDebugReplayFrameResult, autoplay: boolean): void {
        if (!result.ok) {
            this.params.setStatus("error", result.message);
            return;
        }
        this.params.setStatus(
            "running",
            autoplay
                ? `replay 再生中 ${result.frameIndex + 1}/${this.params.frameCount()}`
                : `replay frame ${result.frameIndex}`,
        );
    }
}
