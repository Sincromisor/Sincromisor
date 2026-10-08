import type { TemporalStateEstimatorConfig } from "./temporalStateEstimator";
import type { TemporalArmState } from "./temporalUpperBodyState";

/** 観測信頼度とは別の、IKへ適用する姿勢の重み。旧保存値は従来の状態別重みで読む。 */
export function temporalArmApplicationWeight(arm: TemporalArmState): number {
    if (arm.applicationWeight !== undefined) return arm.applicationWeight;
    if (arm.state === "lost") return 0;
    return arm.confidence * (arm.state === "suspect" ? 0.55 : arm.state === "predicted" ? 0.35 : 1);
}

/**
 * 固定した最後の有効観測から欠損姿勢を評価する純粋計算。出力を予測基点へ書き戻さない。
 * 減衰速度の積分を解析式で求め、長い描画間隔をフィルターのdtとして使わない。
 */
export function predictTemporalArmFromObservation(
    base: TemporalArmState,
    ageMs: number,
    config: TemporalStateEstimatorConfig,
): TemporalArmState {
    const age = Math.max(0, ageMs);
    const seconds = Math.min(age, config.predictionMaxMs) / 1000;
    const rate = Math.log(config.predictionVelocityDampingPerSec);
    const integral = Math.abs(rate) < 1e-9 ? seconds : Math.expm1(rate * seconds) / rate;
    const advance = (value: number, velocity: number, min: number, max: number) =>
        Math.min(max, Math.max(min, value + velocity * integral));
    const expired = age >= config.predictionMaxMs;
    return {
        ...base,
        state: expired ? "lost" : "predicted",
        confidence: 0,
        applicationWeight:
            temporalArmApplicationWeight(base) * Math.max(0, 1 - age / config.predictionMaxMs),
        observedAgeMs: age,
        stateAgeMs: age,
        source: expired ? "comfortable" : "predicted",
        warnings: ["dropout", expired ? "prediction_expired" : "prediction_active"],
        reach: advance(base.reach, base.velocity.reachPerSec, 0, 1.15),
        elevationRad: advance(
            base.elevationRad,
            base.velocity.elevationRadPerSec,
            -Math.PI / 2,
            Math.PI / 2,
        ),
        openness: advance(base.openness, base.velocity.opennessPerSec, -1, 1),
        forwardness: advance(base.forwardness, base.velocity.forwardnessPerSec, 0, 1),
        elbowFlexionRad: advance(
            base.elbowFlexionRad,
            base.velocity.elbowFlexionRadPerSec,
            0,
            Math.PI,
        ),
        bodyLocalWrist: base.bodyLocalWrist?.map(
            (value, index) => value + (base.velocity.wrist?.[index] ?? 0) * integral,
        ) as TemporalArmState["bodyLocalWrist"],
        velocity: {
            wrist: base.velocity.wrist?.map(
                (value) => value * Math.exp(rate * seconds),
            ) as TemporalArmState["velocity"]["wrist"],
            reachPerSec: base.velocity.reachPerSec * Math.exp(rate * seconds),
            elevationRadPerSec: base.velocity.elevationRadPerSec * Math.exp(rate * seconds),
            opennessPerSec: base.velocity.opennessPerSec * Math.exp(rate * seconds),
            forwardnessPerSec: base.velocity.forwardnessPerSec * Math.exp(rate * seconds),
            elbowFlexionRadPerSec: base.velocity.elbowFlexionRadPerSec * Math.exp(rate * seconds),
        },
        recoveringBlend: undefined,
    };
}
