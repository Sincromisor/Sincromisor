import type { SincroPoseMotionSnapshot } from "../poseTracking/sincroPoseMotionSnapshot";

const MIN_POSE_INFERENCE_WARN_MS = 38;
const POSE_INFERENCE_WARN_BUDGET_RATIO = 0.9;
const POSE_INFERENCE_WARMUP_SAMPLE_LIMIT = 6;
const POSE_INFERENCE_WARN_LIMIT = 4;
const POSE_FAILURE_LIMIT = 18;

type TrackerRuntimePosePerformanceGateOptions = {
    targetPoseInferenceFps: number;
    ignorePerformanceFallback: boolean;
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

    evaluate(snapshot: SincroPoseMotionSnapshot): string | undefined {
        if (snapshot.consecutiveFailures >= POSE_FAILURE_LIMIT) {
            return "pose_detection_failed_repeatedly";
        }
        if (this.ignorePerformanceFallback) {
            // 低性能 GPU での調整中は 10fps 未満でも姿勢 snapshot を観測し続けたい。
            // hard failure は別 gate に残し、性能 gate だけを明示設定でバイパスする。
            this.slowPoseInferenceCount = 0;
            return undefined;
        }
        this.poseInferenceSampleCount += 1;
        if (this.poseInferenceSampleCount <= POSE_INFERENCE_WARMUP_SAMPLE_LIMIT) {
            // MediaPipe の初回 video 推論には wasm / GPU delegate のウォームアップが混ざる。
            // 起動コストを常時性能不足と誤認しないよう、安定後のサンプルだけで降格判定する。
            this.slowPoseInferenceCount = 0;
            return undefined;
        }
        if (snapshot.inferenceTimeMs >= this.poseInferenceWarnMs()) {
            this.slowPoseInferenceCount += 1;
        } else {
            this.slowPoseInferenceCount = 0;
        }
        return this.slowPoseInferenceCount >= POSE_INFERENCE_WARN_LIMIT
            ? "pose_inference_too_slow"
            : undefined;
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
}
