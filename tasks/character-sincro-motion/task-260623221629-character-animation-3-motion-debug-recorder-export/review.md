# Review: task-260623221629-character-animation-3-motion-debug-recorder-export

## 判定

NEEDS_REVISION

現行 HEAD の依存 schema は frame `timestamp` と frame top-level を strict に検証しているため、task.md の frame payload 受け入れ条件をそのまま実装すると `parseMotionDebugLogLines()` validation 条件と両立しない。公開される motion debug log 形式の受け入れ条件が非一意で、実装へ進ませると schema 準拠か task.md 準拠のどちらかを破る。

## 指摘事項

- [High] `task.md:19-20` が現行 `SincroMotionDebugFrame` schema と矛盾している。task.md は frame payload に `timestamp.receivedAtPerformanceMs` を最低保存し、その NDJSON を `parseMotionDebugLogLines()` で validation できることを求めているが、現行 schema は `timestamp` を `{ mediaTimeMs }` の strict object として定義している（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:82-86`）。そのため `receivedAtPerformanceMs` を追加すると `invalid_record` になり、省略すると task.md の受け入れ条件を満たせない。task.md を修正し、`receivedAtPerformanceMs` を本タスクで schema へ追加するのか、既存 schema に合わせて保存対象から外すのかを一意に決めること。schema を拡張するなら依存タスクとの差分責務、既存 parser test、設計文書更新も受け入れ条件へ明記する必要がある。
- [High] `task.md:19-20` は frame top-level `tracker` の保存と validation を同時に求めているが、現行 strict frame schema は `tracker` を許可していない。許可される frame top-level slot は `frameIndex`、`timestamp`、`video`、`mediapipe`、`poseSnapshot`、`reliability`、`canonical`、`temporal`、`intent`、`solver`、`finalPose`、`applied`、`metrics` に固定されている（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:95-111`）。設計文書も normalized pose を `frame.poseSnapshot`、MediaPipe raw result を `frame.mediapipe` に分けると定義している（`documents/design/frontend/character/motion.md:96-100`、`documents/design/frontend/character/tracking.md:86-89`）。task.md を修正し、tracker stats を保存するなら既存 slot のどこへ入れるか、または schema に `frame.tracker` を追加するかを一意に決めること。

## 実装者への申し送り

- 既存 `MotionDebugApp` / controls / PNG capture に関する file:line 前提は現行 HEAD と一致している。`MotionDebugApp` の所有境界は `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:69`、runtime 起動は `startRuntimeWithStream()` 周辺の `:211`、pose callback は `:274` / `:281`、window API は `:300`、controls の callback pattern は `sincromisor-frontend/src/pages/motionDebug/motionDebugControls.ts:17` で確認できる。
- `source.kind`、camera setting scrub、frame 記録起点、record / stop / download API、ドキュメント同期の条件は具体化されており、上記 schema 矛盾が解消されれば実装可能な粒度に見える。
- 改訂時は `task.md:19` の最低 frame payload と `task.md:20` の parser validation 条件を、依存 schema の正本 `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts` と完全に一致させること。
