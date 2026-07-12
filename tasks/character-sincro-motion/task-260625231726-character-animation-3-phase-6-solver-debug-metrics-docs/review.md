# Review: task-260625231726-character-animation-3-phase-6-solver-debug-metrics-docs

## 判定

APPROVED

前回 blocking だった `TemporalArmIkBridgeResult` runtime 型の直接保存は、保存専用 `MotionDebugTemporalArmIkBridgeSnapshot` と tuple 化された `target.wrist` / `target.elbowPole` に差し替わっており解消済み。`profile.measurements` と metrics threshold も finite number 保存に固定され、plain object / array / finite number 制約と矛盾しない。

## 指摘事項

なし。

## 実装者への申し送り

- `MotionDebugTemporalArmIkBridgeSnapshot` は保存専用 shape として扱い、runtime `TemporalArmIkBridgeResult.target` の `SincroArmIkTarget` をそのまま spread / JSON 化しないこと。`target.wrist` / `target.elbowPole` は `Vector3` から `readonly [number, number, number]` へ明示変換する（根拠: `sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:50`, `sincromisor-frontend/src/character/ik/sincroArmIkTypes.ts:7`, `task.md:58`）。
- `TemporalArmIkScaleSnapshot` / `TemporalArmIkDebugSnapshot` は current HEAD では finite number、boolean、`TemporalTuple3` で構成されているため、保存時 parser では非 finite number と unknown enum を弾けばよい（`sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:20`, `sincromisor-frontend/src/character/motionSolver/temporalArmSolverBridge.ts:32`, `sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts:43`）。
- `MinimalAvatarMotionProfile.measurements` は runtime では optional number field を持つため、task.md どおり保存時は finite number の field だけを残し、未計測 `undefined` は omit する（`sincromisor-frontend/src/character/avatarProfile/minimalAvatarMotionProfile.ts:20`, `task.md:76`）。
- Phase 6 metrics key 追加時は `MotionMetricKey` / `MOTION_METRIC_KEYS` / default thresholds / baseline parser の同期が必要。threshold は既存 `MotionMetricThreshold` の `pass` / `warn` / `fail` finite number object に保存し、表の `fail > N` は保存値ではなく判定説明として扱う（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:22`, `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:42`, `sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts:37`, `task.md:91`）。
- 公開 WebRTC / backend 契約は変更しない一方、developer-visible な motion debug log、metrics baseline、VRM pose 適用責務は変わる。task.md は design docs 同期を受け入れ条件に含めているため、実装時は `documents/design/frontend/character/` の同期を忘れないこと。
