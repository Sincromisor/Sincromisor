# Review: task-260623221639-character-animation-3-motion-metrics-baseline

## 判定

APPROVED

前回 blocking だった `reachClampOccupancy` / `recoveryJumpAngleDeg` / `calculateReplayMetrics(config)` / `addedLatencyMs` の契約は、現 HEAD の保存 slot と実装境界に揃っており、実装に進めてよい。残る注意点は実装時に妥当に決定できる範囲、または記述の軽微な取りこぼしであり blocking ではない。

## 指摘事項

- [Medium] テスト節の `reachClampOccupancy` 説明が古い wording を残している。設計判断の表では `constraint.jointLimited === true` または `targetPushDistance > 0` の frame 比に固定され、現 HEAD の constraint snapshot と整合している（`sincromisor-frontend/src/character/ik/sincroArmIkConstraint.ts:5`、`sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts:278`）。一方、テスト節には「constraint reason がある frame の occupancy」とあり、実装者が reason ベースの fixture を作ると設計表とずれる。受け入れ条件本文と設計表が正本なので blocking にはしないが、実装時のテスト fixture は `jointLimited` / `targetPushDistance` で作ること。

## 実装者への申し送り

- `SincroMotionDebugFrame` は `poseSnapshot` / `solver` / `applied` / `metrics` を zod 上 `unknown` として受けている（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:95`）。metrics core では各 slot を型ガードし、不足時は task.md の方針どおり `not_available` にすること。
- 現行 recorder は `frame.poseSnapshot`、`frame.solver.poseRetarget`、`frame.metrics.receivedAtPerformanceMs`、`frame.metrics.tracker` を保存するが、`frame.applied` は保存していない（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:100`）。`angularVelocitySpikeCount` は当面 `not_available` になり得る前提で、`recoveryJumpAngleDeg` は task.md の優先順どおり `applied` が無ければ quaternion fallback を使うこと。
- `MotionReplayPlayer` は frames を private に保持し、現状は `frameCount()` / `frameMediaTimeMs()` だけを公開している（`sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts:62`）。`calculateReplayMetrics(config)` 実装では、player に read-only frames accessor または metrics 計算メソッドを小さく追加するのが自然。UI 表示は本タスクのスコープ外。
- `addedLatencyMs` は `frame.metrics.tracker.workerRoundTripMs` の p95 に固定され、`frame.timestamp.mediaTimeMs` と `frame.metrics.receivedAtPerformanceMs` の差分を取らない方針で現行 schema / recorder / design と整合している（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:14`）。
- `calculateMotionMetricSummary(frames, config)` は pure function として、`generatedAtIso` も含め config / frames だけを読む方針で実装する。core 内で `new Date()` や `performance.now()` を呼ばないこと。
- `motion-debug` window API の型は `sincromisor-frontend/src/pages/motionDebug/types.ts:65`、実体の install は `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:521` 付近にある。
- ドキュメント同期は受け入れ条件に含まれており、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` の同期先指定も妥当。
