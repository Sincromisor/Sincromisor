# Review: task-260625194536-character-animation-3-phase-5-temporal-debug-replay-metrics

## 判定
APPROVED

前回 blocking だった追加 metrics の shape / unit / threshold / 集計単位は `task.md:20`-`25` で単一数値 metric として確定済みです。改訂箇所に、実装を破綻させる新たな要件矛盾や既存 `MotionMetricSummary` 契約との不整合は見つかりませんでした。

## 指摘事項
なし

## 実装者への申し送り
- 追加 metrics は `MotionMetricResult.value: number | null` と `Record<MotionMetricKey, MotionMetricResult>` を維持する前提で実装すること。複合 object は追加せず、`temporalPredictedArmFrameCount`、`temporalRecoveringArmFrameCount`、`temporalLostArmDurationMs`、`temporalMaxRecoveryJumpDegEquivalent`、`temporalNeutralWristJitter` の 5 key を `MOTION_METRIC_KEYS` / `DEFAULT_MOTION_METRIC_THRESHOLDS` / `METRIC_DEFINITIONS` / `resolveThresholds()` / baseline schema fixture / tests に通す。
- `temporalPredictedArmFrameCount` と `temporalRecoveringArmFrameCount` は frame 数ではなく arm-frame 数として数える。`temporalLostArmDurationMs` も left / right の lost duration 合算で、隣接 frame の `mediaTimeMs` 差分を `0..250` に clamp する指定に従う。
- `temporalMaxRecoveryJumpDegEquivalent` は recovering 中の左右腕 scalar の連続 frame 差分最大値で、rad scalar と normalized scalar の換算係数は `task.md:23` の固定値を使う。
- `temporalNeutralWristJitter` は `fixtureId === "neutral-10s"` かつ tracked / suspect の temporal `bodyLocalWrist` sample が 2 以上ある場合だけ available。その他は `not_available` として扱う。
- temporal 型・parser は依存タスク `task-260625194536-character-animation-3-phase-5-temporal-state-contract` の `TemporalUpperBodyState` / `parseTemporalUpperBodyState()` contract に合わせること。現ワークツリー単体では temporal 実装ファイルはまだ存在しない前提で確認しています。
