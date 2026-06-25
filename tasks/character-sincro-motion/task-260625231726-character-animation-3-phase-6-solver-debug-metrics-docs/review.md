# Review: task-260625231726-character-animation-3-phase-6-solver-debug-metrics-docs

## 判定
APPROVED

前回 blocking だった `frame.solver` 保存 schema と Phase 6 metrics 計算仕様は、改訂で最小 schema / field path / per-arm 集計 / sampleCount / missing-invalid 方針まで固定された。残る注意点は既存型への落とし込み時の補足で足りるため、実装に進めてよい。

## 指摘事項
- [Medium] metrics table の `threshold 初期値` は判定規則としては明確だが、既存 `MotionMetricThreshold` は `pass` / `warn` / `fail` の finite number を保持する（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:42`、`sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts:37`）。`fail > 3` などの表記はそのまま object にできないため、実装時は `fail` field に保存する finite number を既存 convention に合わせて決める必要がある。判定自体は lower-is-better の `pass <= N` / `warn <= N` / それ以外 fail で一意なので、blocking ではない。
- [Low] `MotionDebugPhase6SolverSnapshot.profile.measurements` に `number | undefined` が含まれる一方、保存値は finite number / plain JSON value に限定されている。NDJSON 保存時に `undefined` field は消えるため、実装時は undefined を保存しない、または optional field として omit する扱いに揃えるとよい。

## 実装者への申し送り
- 前回 High の `frame.solver` schema 未確定は解消済み。既存 `frame.solver.poseRetarget` / `poseRetargetRuntime` は維持し、Phase 6 は `frame.solver.phase6` に追加する方針で進める。
- 前回 High の Phase 6 metrics 仕様未確定は解消済み。新 key は table の arm-frame / bone-frame 定義と `not_available` 方針に従う。
- 前回 Medium の `invalid` 表示条件は、未知 schemaVersion、非 finite number、unknown enum、runtime object 検出時と明記されたため解消済み。
- 前回 Medium の依存 task 特定は、canonical task ID と提供 contract が追記されたため解消済み。
- `meta.yaml` の review / reviewed_sha 更新はオーケストレーター側で行うこと。
