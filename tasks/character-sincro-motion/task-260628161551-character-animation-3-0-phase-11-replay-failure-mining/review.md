# Review: task-260628161551-character-animation-3-0-phase-11-replay-failure-mining

## 判定

APPROVED

前回の High 指摘 3 件は、candidate order / id、必須フィールド、frame scan の期待値が `task.md` 上で一意に固定され解消されている。改訂で追加された metric key / 型 / motion-debug API 前提も既存コードと整合しており、新たな blocking 破綻は見つからない。

## 指摘事項

- なし

## 実装者への申し送り

- `candidateId` は `task.md:56` の通り、`qaResult.fixtures` 順かつ fixture 内 target order 順で生成し、同一 fixture 内 0-based index の `fixtureId:target:index` に固定する。
- `evidence`、`requiresHumanLabel`、`notes`、report `warnings` は `task.md:57` から `task.md:62` の固定値に従う。特に `not_available` だけで warn になった fixture は `do_not_optimize` candidate にまとめる。
- `frameRange` は `task.md:63` から `task.md:65` の通り、v1 では `gestureFlickerCount` と `sideSwapCount` の最初に見つかった event だけを保存する。
- 依存タスク `task-260628161547-character-animation-3-0-phase-11-post-processing-contract` は現状 `status: open` / `review: null`。実装着手は依存タスクの完了後に行う前提で扱うこと。
- 既存前提として、`MotionMetricKey` と `MOTION_METRIC_KEYS` は `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:34`、`motionMetrics.ts:108`、`MotionQaRegressionResult` は `sincromisor-frontend/src/character/motionEvaluation/motionQaRegression.ts:60`、`MotionDebugApi.runQaRegression` は `sincromisor-frontend/src/pages/motionDebug/types.ts:262`、`types.ts:285` に存在する。
