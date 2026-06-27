# Implementation Log: task-260627180715-character-animation-3-0-phase-9-motion-intent-contract

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- `MotionIntentWarningCode` は保存 schema の一部として `motionIntentState.ts` から export した。
- `MotionIntentParseResult` は既存 `parseCanonicalUpperBodyState()` / `parseTemporalUpperBodyState()` と同じ `{ ok: true; state } | { ok: false; errors }` 形にした。
- `frame.intent` は `motionDebugLogSchema.ts` の `z.unknown().optional()` を維持し、log load 全体の strict validation は追加しなかった。strict parse は `parseMotionIntentState()` と motion-debug viewer の intent layer に閉じた。
- viewer の intent layer は `RESERVED_PHASE_1_LAYERS` から外し、saved `frame.intent` のみを `available` / `invalid` / `not_recorded` に分類した。live snapshot fallback は追加していない。
- MotionIntent v1 contract は `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` に同期した。

### 逸脱 / 補足

- `npm run check` が既存 task Markdown 8 件の Prettier 不一致で失敗したため、実装 worktree 側で該当 task 文書を Prettier の機械整形のみ行い、同じ実装 commit に含めた。main checkout 側の状態ファイルはこの `impl.md` 追記以外は触っていない。
- worktree には root `node_modules` が無かったため、途中で一時的に symlink を作って `tasks:check` を確認した。symlink は削除済みで、最終 `npm run gate` は clean 状態で PASS した。

### 確認結果

- `cd sincromisor-frontend && npm run test -- motionIntentState motionDebugViewerModel`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run tasks:check`: PASS
- `npm run gate`: PASS（commit `e49738bd2af573736bbf3d7e52528aaa6203a2b9`、clean）

### 未実行確認

- ブラウザでの motion-debug 手動 replay 操作は未実行。今回の変更は保存済み `frame.intent` の parser / viewer model と contract 文書に限定されるため、unit test と gate で確認した。

### 残リスク

- Gesture Recognizer からの intent 推定、semantic pose layer、finger bone 適用は後続 task の範囲。現時点では `frame.intent` を生成する本番経路は追加していない。
