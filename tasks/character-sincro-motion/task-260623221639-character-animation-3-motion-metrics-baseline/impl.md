# Implementation Log: task-260623221639-character-animation-3-motion-metrics-baseline

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- `review.md` の申し送りどおり、metrics core は `SincroMotionDebugFrame` の `unknown` slot を Zod の局所 schema で型ガードし、入力不足は `not_available` にした。
- `addedLatencyMs` は `frame.metrics.tracker.workerRoundTripMs` の p95 だけを使い、`mediaTimeMs` と `receivedAtPerformanceMs` の差分は取らない実装にした。
- `reachClampOccupancy` は reason ではなく、`constraint.jointLimited === true` または `targetPushDistance > 0` の frame 比で計算した。
- `recoveryJumpAngleDeg` は task.md の recovery event 定義に合わせ、recovered frame の `mediaTimeMs` から 500ms window を評価する。`applied.angularVelocityDegPerSec` を優先し、欠落時だけ `solver.poseRetarget` の arm quaternion 連続差分へ fallback する。
- `MotionReplayPlayer` には metrics 用の read-only frames accessor と loaded 判定だけを追加し、UI 表示は後続タスクのスコープとして触らなかった。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に metrics summary、comparison、P0 fixture、baseline schema、`calculateReplayMetrics(config)` の境界を同期した。
- `documents/design/frontend/character/tracking.md` に tracking loss、side swap、added latency、recovery jump の入力境界を同期した。

### 確認

- `sincromisor-frontend`: `npm run test -- motionMetrics motionMetricBaselineSchema`
- `sincromisor-frontend`: `npm run build`
- `sincromisor-frontend`: `npm run check`
- repo root: `npm run gate`（dirty tree で lint/build/test PASS。コミット後に再実行予定）

### 残リスク / 未実行

- 実 camera / 実 replay log での baseline 採取と閾値調整は本タスクの非対象。
- UI の metrics table / chart 表示は本タスクの非対象。
- `npm run tasks:check` は実装 worktree の root `node_modules/yaml` が無く `ERR_MODULE_NOT_FOUND` で未完了。main checkout 側には `node_modules/yaml` が存在するが、実装 worktree の隔離状態を優先して追加 install は行わなかった。
