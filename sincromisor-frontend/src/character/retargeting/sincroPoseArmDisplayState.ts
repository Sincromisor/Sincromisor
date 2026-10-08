import { predictTemporalArmFromObservation } from "../temporal/temporalArmPrediction";
import { createDefaultTemporalStateEstimatorConfig } from "../temporal/temporalStateEstimator";
import type { TemporalArmState, TemporalUpperBodyState } from "../temporal/temporalUpperBodyState";

/** リターゲットが所有する表示予測の基点。観測フィルターの履歴とは独立する。 */
export class SincroPoseArmDisplayState {
    private anchors: Partial<
        Record<"left" | "right", { arm: TemporalArmState; mediaTimeMs: number }>
    > = {};
    private observationTimeMs?: number;
    private evaluationTimeMs?: number;
    private readonly config = createDefaultTemporalStateEstimatorConfig();

    /** 入力切替・停止・VRM交換で最後の有効観測も破棄する。 */
    reset(): void {
        this.anchors = {};
        this.observationTimeMs = undefined;
        this.evaluationTimeMs = undefined;
    }

    /** 新しい有効観測だけを採用し、無到着の描画は固定基点から左右別々に評価する。 */
    evaluate(temporal: TemporalUpperBodyState, nowMs: number): TemporalUpperBodyState {
        const observedAt = temporal.timestamp.mediaTimeMs;
        if (
            (this.observationTimeMs !== undefined && observedAt < this.observationTimeMs) ||
            (this.evaluationTimeMs !== undefined && nowMs < this.evaluationTimeMs)
        )
            this.reset();
        const fresh = observedAt !== this.observationTimeMs;
        const arms = { ...temporal.arms };
        for (const side of ["left", "right"] as const) {
            const arm = temporal.arms[side];
            const valid =
                arm.observedAgeMs === 0 &&
                arm.state !== "lost" &&
                arm.state !== "predicted" &&
                arm.confidence >= this.config.lostConfidenceThreshold;
            if (fresh && valid)
                this.anchors[side] = { arm: structuredClone(arm), mediaTimeMs: observedAt };
            const anchor = this.anchors[side];
            if (anchor && (!valid || nowMs > observedAt)) {
                arms[side] = predictTemporalArmFromObservation(
                    anchor.arm,
                    nowMs - anchor.mediaTimeMs,
                    this.config,
                );
            }
        }
        this.observationTimeMs = observedAt;
        this.evaluationTimeMs = nowMs;
        return { ...temporal, arms };
    }
}
