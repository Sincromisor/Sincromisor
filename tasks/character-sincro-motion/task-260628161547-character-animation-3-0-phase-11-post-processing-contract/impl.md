# Implementation Log: task-260628161547-character-animation-3-0-phase-11-post-processing-contract

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- `MotionPostProcessingParseResult` は既存 `CanonicalUpperBodyState` / `TemporalUpperBodyState` / `MotionIntentState` parser と同じ `{ ok: true; ... } | { ok: false; errors }`、`code` / `path` / `message` 付き error の形に揃えた。
- no-op result は review.md の申し送りどおり `processor_disabled`、`output: {}`、`corrections: []` に固定し、canonical / temporal / intent の入力値を output へ複製しない方針にした。
- viewer の `postProcessing` は replay frame の saved `frame.postProcessing` だけを正本にし、欠損時は live no-op へ fallback せず `not_recorded` とする実装にした。
- `frame.postProcessing` は log schema 上では optional `unknown` slot に留め、検証は `parseMotionPostProcessingResult()` に閉じた。
- `previousValue` / `nextValue` は JSON-like な plain value だけを許可し、`isVector3` / `isQuaternion` marker と `{ x, y, z }` / `{ x, y, z, w }` 形状を runtime object 風として reject した。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に Phase 11 post-processing contract、no-op v1、`frame.postProcessing` の saved value 正本化、VRM bone rotation / IK quaternion / avatar profile を output に含めない方針を同期した。

### ハマった点 / 逸脱

- `npm run check` の Markdown check が、実装着手前から worktree 側 `tasks/**/review.md` 4 件の Prettier 整形差分で失敗した。gate を通すため、内容は変えず空行追加のみの Prettier 整形を同じ commit に含めた。

### 確認

- `cd sincromisor-frontend && npm run test -- motionPostProcessingState motionDebugViewerModel motionDebugLogSchema motionDebugRecordingController`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run gate` at commit `fe75844`

### 残リスク

- post-processing v1 は意図的に no-op のため、learned / rule-based 補正の品質や runtime 境界は後続タスクで検証する。
