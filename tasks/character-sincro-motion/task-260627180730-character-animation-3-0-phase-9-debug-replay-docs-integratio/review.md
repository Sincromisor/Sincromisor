# Review: task-260627180730-character-animation-3-0-phase-9-debug-replay-docs-integratio

## 判定

APPROVED

前回の High 指摘 2 件は、intent metrics の閾値 / status 方針と semantic / finger debug の保存先を task.md が固定したため解消済み。残る指摘は実装者が本文全体から一意に補える表現揺れであり、blocking ではない。

## 指摘事項

- [Low] Phase 9 debug snapshot の説明文は「`intent`、`semantic`、`finger`、`layers`、`warnings` だけ」と書いている一方、直下の `MotionDebugPhase9SemanticSnapshot` 型には `timestamp` も含まれている。型ブロックを正として実装すれば破綻しないが、実装時は `timestamp` を落とさないこと。
- [Low] 設計判断に「semantic debug snapshot は追加する場合も」という前回由来の任意表現が残っている。完了条件では `frame.solver.phase9` への保存が必須化されているため、実装時は完了条件を優先すること。

## 実装者への申し送り

- 前回 High だった新規 intent metrics は、4 metric の unit / direction / `DEFAULT_MOTION_METRIC_THRESHOLDS` / invalid intent の扱いが追記され、既存 `MotionMetricResult` を拡張しない方針まで固定された。
- 前回 High だった semantic / finger debug 接続は、保存先が `frame.solver.phase9`、viewer 表示が solver layer の `phase9` substatus として固定された。旧 log 欠損時は `not_recorded`、schema invalid は `invalid` として扱う。
- `SemanticMotionPoseLayerDebugSnapshot` と `FingerCurlPoseDebugSnapshot` は依存タスクで export される前提になっている。依存成果物が HEAD に無い場合は、task.md の完了条件どおり依存未充足として止めること。
