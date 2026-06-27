import type {
    SincroTrackerRoiPauseState,
    SincroTrackerRoiReasonCode,
    SincroTrackerRoiStats,
} from "./sincroTrackerWorkerTypes";

export type TrackerRuntimeRoiBudgetFrame = {
    handRan: boolean;
    faceRoiRan: boolean;
    handInferenceTimeMs?: number;
    faceRoiInferenceTimeMs?: number;
    handUsedFullFrameFallback?: boolean;
    faceUsedFullFrameFallback?: boolean;
    skippedReasons?: SincroTrackerRoiReasonCode[];
    targetPoseInferenceFps: number;
};

const OVER_BUDGET_ADVANCE_FRAMES = 5;
const BUDGET_RECOVERY_FRAMES = 30;
const ROI_BUDGET_RATIO = 0.55;

const PAUSE_ORDER: SincroTrackerRoiPauseState[] = [
    "active",
    "hand-paused",
    "face-paused",
    "all-paused",
];

export class TrackerRuntimeRoiBudgetController {
    private pauseState: SincroTrackerRoiPauseState = "active";
    private fallbackCount = 0;
    private skippedFrames = 0;
    private consecutiveOverBudgetFrames = 0;
    private consecutiveWithinBudgetFrames = 0;
    private readonly reasonCodes = new Set<SincroTrackerRoiReasonCode>();

    reset(): void {
        this.pauseState = "active";
        this.fallbackCount = 0;
        this.skippedFrames = 0;
        this.consecutiveOverBudgetFrames = 0;
        this.consecutiveWithinBudgetFrames = 0;
        this.reasonCodes.clear();
    }

    getPauseState(): SincroTrackerRoiPauseState {
        return this.pauseState;
    }

    handIsPaused(): boolean {
        return this.pauseState !== "active";
    }

    faceRoiIsPaused(): boolean {
        return this.pauseState === "face-paused" || this.pauseState === "all-paused";
    }

    recordFrame(frame: TrackerRuntimeRoiBudgetFrame): SincroTrackerRoiStats {
        this.recordSkippedReasons(frame.skippedReasons ?? []);
        if (frame.handUsedFullFrameFallback === true || frame.faceUsedFullFrameFallback === true) {
            this.fallbackCount += 1;
            this.reasonCodes.add("roi_fallback_full_frame");
        }
        const ranRoi = frame.handRan || frame.faceRoiRan;
        if (ranRoi) {
            this.recordBudgetResult(frame);
        }
        return this.getStats();
    }

    getStats(): SincroTrackerRoiStats {
        return {
            pauseState: this.pauseState,
            fallbackCount: this.fallbackCount,
            skippedFrames: this.skippedFrames,
            consecutiveOverBudgetFrames: this.consecutiveOverBudgetFrames,
            reasonCodes: [...this.reasonCodes],
        };
    }

    private recordSkippedReasons(reasons: SincroTrackerRoiReasonCode[]): void {
        if (reasons.length === 0) {
            return;
        }
        this.skippedFrames += 1;
        for (const reason of reasons) {
            this.reasonCodes.add(reason);
        }
    }

    private recordBudgetResult(frame: TrackerRuntimeRoiBudgetFrame): void {
        const budgetMs = (1000 / Math.max(1, frame.targetPoseInferenceFps)) * ROI_BUDGET_RATIO;
        const roiInferenceTimeMs =
            finiteOrZero(frame.handInferenceTimeMs) + finiteOrZero(frame.faceRoiInferenceTimeMs);
        if (roiInferenceTimeMs > budgetMs) {
            this.consecutiveOverBudgetFrames += 1;
            this.consecutiveWithinBudgetFrames = 0;
            this.reasonCodes.add("roi_inference_over_budget");
            if (this.consecutiveOverBudgetFrames >= OVER_BUDGET_ADVANCE_FRAMES) {
                this.advancePauseState();
            }
            return;
        }
        this.consecutiveOverBudgetFrames = 0;
        this.consecutiveWithinBudgetFrames += 1;
        if (this.consecutiveWithinBudgetFrames >= BUDGET_RECOVERY_FRAMES) {
            this.recoverPauseState();
        }
    }

    private advancePauseState(): void {
        const currentIndex = PAUSE_ORDER.indexOf(this.pauseState);
        this.pauseState = PAUSE_ORDER[Math.min(currentIndex + 1, PAUSE_ORDER.length - 1)];
        this.consecutiveOverBudgetFrames = 0;
        this.consecutiveWithinBudgetFrames = 0;
    }

    private recoverPauseState(): void {
        const currentIndex = PAUSE_ORDER.indexOf(this.pauseState);
        this.pauseState = PAUSE_ORDER[Math.max(currentIndex - 1, 0)];
        this.consecutiveOverBudgetFrames = 0;
        this.consecutiveWithinBudgetFrames = 0;
    }
}

function finiteOrZero(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) ? value : 0;
}
