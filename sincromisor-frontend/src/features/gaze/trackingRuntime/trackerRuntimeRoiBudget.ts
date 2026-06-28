/**
 * Hand / Face ROI optional pass の pause / recovery を管理する budget controller。
 * ROI pause は camera と full-frame Face を止めない縮退であり、counter threshold を変える場合は tracking design の ROI budget と stats 表示を確認する。
 */
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
    private policyPauseState?: SincroTrackerRoiPauseState;
    private fallbackCount = 0;
    private skippedFrames = 0;
    private consecutiveOverBudgetFrames = 0;
    private consecutiveWithinBudgetFrames = 0;
    private readonly reasonCodes = new Set<SincroTrackerRoiReasonCode>();

    reset(): void {
        this.pauseState = "active";
        this.policyPauseState = undefined;
        this.fallbackCount = 0;
        this.skippedFrames = 0;
        this.consecutiveOverBudgetFrames = 0;
        this.consecutiveWithinBudgetFrames = 0;
        this.reasonCodes.clear();
    }

    getPauseState(): SincroTrackerRoiPauseState {
        return this.resolveEffectivePauseState();
    }

    setPolicyPauseState(pauseState: SincroTrackerRoiPauseState | undefined): void {
        this.policyPauseState = pauseState === "active" ? undefined : pauseState;
        if (this.policyPauseState === "hand-paused") {
            this.reasonCodes.add("hand_roi_paused");
        }
    }

    handIsPaused(): boolean {
        return this.resolveEffectivePauseState() !== "active";
    }

    faceRoiIsPaused(): boolean {
        const pauseState = this.resolveEffectivePauseState();
        return pauseState === "face-paused" || pauseState === "all-paused";
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
            pauseState: this.resolveEffectivePauseState(),
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
        const budgetSkippedReasons = reasons.filter(
            (reason) => !(this.policyPauseState === "hand-paused" && reason === "hand_roi_paused"),
        );
        if (budgetSkippedReasons.length > 0) {
            this.skippedFrames += 1;
        }
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

    private resolveEffectivePauseState(): SincroTrackerRoiPauseState {
        const budgetIndex = PAUSE_ORDER.indexOf(this.pauseState);
        const policyIndex =
            this.policyPauseState === undefined ? 0 : PAUSE_ORDER.indexOf(this.policyPauseState);
        return PAUSE_ORDER[Math.max(budgetIndex, policyIndex)];
    }
}

function finiteOrZero(value: number | undefined): number {
    return value !== undefined && Number.isFinite(value) ? value : 0;
}
