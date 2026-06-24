import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";
import type {
    TrackerPerformanceReasonCode,
    TrackerRuntimeDegradationState,
} from "./trackerRuntimePerformanceBudget";

const MIN_POSE_INFERENCE_WARN_MS = 38;
const POSE_INFERENCE_WARN_BUDGET_RATIO = 0.9;
const POSE_INFERENCE_WARMUP_SAMPLE_LIMIT = 6;
const POSE_INFERENCE_WARN_LIMIT = 4;
const POSE_FAILURE_LIMIT = 18;

type TrackerRuntimePosePerformanceGateOptions = {
    targetPoseInferenceFps: number;
    ignorePerformanceFallback: boolean;
};

export type TrackerRuntimePosePerformanceGateResult = {
    state: TrackerRuntimeDegradationState;
    reason?: TrackerPerformanceReasonCode;
    fallbackReason?: string;
    shouldDegradeToFaceOnly: boolean;
};

export class TrackerRuntimePosePerformanceGate {
    private targetPoseInferenceFps = 12;
    private ignorePerformanceFallback = false;
    private poseInferenceSampleCount = 0;
    private slowPoseInferenceCount = 0;

    configure(options: TrackerRuntimePosePerformanceGateOptions): void {
        this.targetPoseInferenceFps = options.targetPoseInferenceFps;
        this.ignorePerformanceFallback = options.ignorePerformanceFallback;
        this.resetSamples();
    }

    reset(): void {
        this.ignorePerformanceFallback = false;
        this.resetSamples();
    }

    evaluate(snapshot: SincroPoseMotionSnapshot): TrackerRuntimePosePerformanceGateResult {
        if (snapshot.consecutiveFailures >= POSE_FAILURE_LIMIT) {
            return {
                state: "face-only",
                reason: "pose_detection_failed_repeatedly",
                fallbackReason: "pose_detection_failed_repeatedly",
                shouldDegradeToFaceOnly: true,
            };
        }
        this.poseInferenceSampleCount += 1;
        if (this.poseInferenceSampleCount <= POSE_INFERENCE_WARMUP_SAMPLE_LIMIT) {
            // MediaPipe の初回 video 推論には wasm / GPU delegate のウォームアップが混ざる。
            // 起動コストを常時性能不足と誤認しないよう、安定後のサンプルだけで降格判定する。
            this.slowPoseInferenceCount = 0;
            return fullResult();
        }
        if (snapshot.inferenceTimeMs >= this.poseInferenceWarnMs()) {
            this.slowPoseInferenceCount += 1;
        } else {
            this.slowPoseInferenceCount = 0;
        }
        if (this.slowPoseInferenceCount < POSE_INFERENCE_WARN_LIMIT) {
            return fullResult();
        }
        return {
            state: "face-only",
            reason: this.poseInferenceReason(snapshot.inferenceTimeMs),
            fallbackReason: "pose_inference_too_slow",
            shouldDegradeToFaceOnly: !this.ignorePerformanceFallback,
        };
    }

    private resetSamples(): void {
        this.poseInferenceSampleCount = 0;
        this.slowPoseInferenceCount = 0;
    }

    private poseInferenceWarnMs(): number {
        const targetIntervalMs = 1000 / this.targetPoseInferenceFps;
        return Math.max(
            MIN_POSE_INFERENCE_WARN_MS,
            targetIntervalMs * POSE_INFERENCE_WARN_BUDGET_RATIO,
        );
    }

    private poseInferenceReason(inferenceTimeMs: number): TrackerPerformanceReasonCode {
        const overBudgetMs = (1000 / this.targetPoseInferenceFps) * 1.25;
        return inferenceTimeMs > overBudgetMs
            ? "pose_inference_over_budget"
            : "pose_inference_warn";
    }
}

function fullResult(): TrackerRuntimePosePerformanceGateResult {
    return {
        state: "full",
        shouldDegradeToFaceOnly: false,
    };
}
