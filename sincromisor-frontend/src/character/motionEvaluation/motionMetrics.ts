// motion metrics の facade。保存 contract は sincro.motion-metrics.v1 と既存 export 名を境界にする。
// 実装は metric group module へ分割し、この facade では計算式・parser・threshold 判定を扱わない。
export { compareMotionMetricSummaries } from "./motionMetricComparison";
export { calculateMotionMetricSummary } from "./motionMetricSummary";
export {
    DEFAULT_MOTION_METRIC_THRESHOLDS,
    MOTION_METRIC_KEYS,
    MOTION_P0_FIXTURE_IDS,
} from "./motionMetricThresholds";
export type {
    MotionMetricComparison,
    MotionMetricConfig,
    MotionMetricDirection,
    MotionMetricKey,
    MotionMetricResult,
    MotionMetricSeverity,
    MotionMetricStatus,
    MotionMetricSummary,
    MotionMetricThreshold,
    MotionMetricUnit,
    MotionP0FixtureId,
} from "./motionMetricTypes";
