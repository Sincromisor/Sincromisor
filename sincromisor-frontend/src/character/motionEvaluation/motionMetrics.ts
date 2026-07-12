/**
 * motion evaluation の外部 import 互換を保つ barrel module。
 * 実装 logic は持たず、公開 surface の変更は QA regression harness と design doc の同期対象になる。
 */
// motion metrics の facade。保存 contract は sincro.motion-metrics.v1 と既存 export 名を境界にする。
// 実装は metric group module へ分割し、この facade では計算式・parser・threshold 判定を扱わない。

export type {
    ComposerComparisonMetricFrameInput,
    ComposerComparisonMetricFrameResult,
    ComposerComparisonMetricKey,
    ComposerComparisonMetricResult,
    ComposerComparisonSummary,
    ComposerComparisonSummaryConfig,
    ComposerComparisonSummaryInputs,
    ComposerComparisonSummaryStatus,
    ComposerComparisonUnavailableReason,
} from "./motionComposerComparisonMetrics";
export {
    COMPOSER_COMPARISON_METRIC_KEYS,
    COMPOSER_COMPARISON_SUMMARY_SCHEMA_VERSION,
    calculateComposerComparisonMetrics,
    calculateComposerComparisonSummary,
    createComposerComparisonUnavailableSummary,
    parseComposerComparisonFrameInput,
} from "./motionComposerComparisonMetrics";
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
