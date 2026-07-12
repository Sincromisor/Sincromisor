# Implementation Log: task-260624013705-character-animation-3-canonical-upper-body-state-contract

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 対応

- `review.md` は APPROVED。申し送りどおり `parseCanonicalUpperBodyState(value)` は throw せず、成功時 `{ ok: true, state }`、失敗時 `{ ok: false, errors }` を返す contract とした。
- `schemaVersion` は `sincro.canonical-upper-body.v1` 固定。入力の `schemaVersion` が string かつ未知値の場合は full schema validation より先に `unknown_schema_version` を返すようにした。
- canonical state は `number`、string enum、3 要素 tuple、plain object の strict Zod schema に限定した。Three.js / VRM / MediaPipe runtime object 風の extra key は strict schema で `invalid_state` になる。
- `DEFAULT_CANONICAL_CALIBRATION_SNAPSHOT` は export し、task.md 指定値の deterministic default とした。`capturedAtMediaTimeMs` は default では未設定。
- parse API の型として `CanonicalUpperBodyStateParseResult` / `CanonicalUpperBodyStateParseError` / `CanonicalUpperBodyStateParseErrorCode` も export した。後続 estimator / replay integration が parse boundary の型を再定義しないため。
- ドキュメント同期は `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に反映済み。motion 側は保存単位・VRM rotation を含めない方針、tracking 側は `SincroPoseMotionSnapshot` と canonical contract を混同しない方針を明記した。
- `npm run check` の Markdown gate が既存 task 文書 5 件の Prettier 整形不足で落ちたため、実装 worktree 側で該当ファイルだけ Prettier 整形した。意味変更はなく、gate を通すための整形差分。

### 検証

- `cd sincromisor-frontend && npm run test -- canonicalUpperBodyState`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `npm run tasks:check`: PASS
- `npm run gate`: PASS at `681f99601b94ee271afbe49a2fdede71da278268`

### 逸脱 / 残リスク

- runtime integration はスコープ外のため未実装。`motion-debug` の `frame.canonical` は後続 integration まで optional slot のまま。
- gate 実行前に root `node_modules` が worktree に無く `tasks:check` が `yaml` import で失敗したため、main checkout の root `node_modules` への一時 symlink を作成して `tasks:check` を実行した。検証後に symlink は削除済みで、実装 worktree はクリーン。

## attempt 2

### 判断 / 対応

- 評価 FAIL の指摘どおり、`too_small` / `too_big` を一律 `out_of_range` にしていたため、tuple arity の shape mismatch が誤分類されていた。
- `classifyIssue()` は `issue.origin === "number"` の数値 range violation だけを `out_of_range` とし、array / object 由来の shape mismatch は `invalid_state` のまま返すように修正した。
- 再発防止として `torso.bodyFront: [0, 0]` の tuple 長不一致が `invalid_state` になる Vitest を追加した。

### 検証

- `cd sincromisor-frontend && npm run test -- canonicalUpperBodyState`: PASS（6 tests）
- `cd sincromisor-frontend && npm run build`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `npm run gate`: PASS at `40758158d15b41cb4f2bc79b58bf5fe0ee8f602c`

### 逸脱 / 残リスク

- 残リスクは attempt 1 と同じく runtime integration はスコープ外で、`motion-debug` の `frame.canonical` は後続 task まで optional slot のまま。
