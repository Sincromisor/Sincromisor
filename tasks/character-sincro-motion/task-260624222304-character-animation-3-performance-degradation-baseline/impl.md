# Implementation Log: task-260624222304-character-animation-3-performance-degradation-baseline

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / review.md 申し送りへの対応

- `worker_transfer_warn` は enum として残したが、本実装では budgetStatus / reasonCodes の自動判定には使わない。task.md の閾値が `workerRoundTripMs` と `pose.inferenceTimeMs` に固定されているため、`transferTimeMs` は observed 値として保存し、transfer 専用 warn 条件は後続の実測基準ができるまで増やさない判断にした。
- 既存の pose gate 文字列 `pose_inference_too_slow` は、`SincroPoseMotionSnapshot.fallbackReason` では従来文字列を維持し、budget `reasonCodes` では `pose_inference_warn` / `pose_inference_over_budget` へ写像する方針にした。連続検出失敗は `pose_detection_failed_repeatedly` のまま enum と文字列を揃えている。
- motion-debug の正の表示面は、live / Debug Console では `MotionDebugSnapshot.tracker` / `sincroMotion.tracker`、recording / replay では `frame.metrics.tracker` とした。viewer の `metrics` layer は motion metric summary が未計算でも replay frame の `frame.metrics` JSON を表示し、`frame.metrics.tracker.budget` を確認できるようにした。既存 metrics key は増やしていない。
- main-thread fallback は `mode: "main-thread"`、`status: "fallback"`、既存 `fallbackReason` 文字列を維持し、effective target を face 8fps / pose 4fps 以下に clamp して `budget.degradation.state = "main-thread-low-fps"` を載せる方針にした。
- `ignorePerformanceFallback: true` は pose inference too slow による face-only 降格だけを抑制し、gate result / budget 用の degradation state と reason code は残す。repeated pose failure は hard failure として従来どおり face-only 降格対象にした。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` に performance budget report、degradation state、main-thread fallback の低 fps clamp、reasonCodes と既存 fallbackReason の関係を同期した。
- `documents/design/frontend/character/motion.md` に `frame.metrics.tracker.budget` の保存先、replay viewer metrics layer で確認する方針、motion metrics key を増やさない判断を同期した。

### 確認

- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceBudget`
- `cd sincromisor-frontend && npm run test -- trackerRuntimePosePerformanceGate`
- `cd sincromisor-frontend && npm run test -- motionDebugLogSchema`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- trackerRuntimePosePerformanceGate trackerRuntimePerformanceBudget motionDebugLogSchema motionDebugViewerModel motionDebugRecorder`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run gate`

### 未実行 / 残リスク

- 手動または Playwright での実機 `motion-debug` Worker fallback 再現は未実行。Worker unavailable / failed、main-thread-low-fps、budget付き log parse は unit test と gate で代替した。
- `worker_transfer_warn` は未使用のため、transfer 単体の重さを status 化する基準は後続タスクで実測に基づいて決める必要がある。
