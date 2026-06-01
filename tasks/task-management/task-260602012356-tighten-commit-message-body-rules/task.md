# Tighten commit message body rules

## 目的

- コミットメッセージ body の必須項目を明確化し、`Why` / `What` / `Verify` / `Risk` が省略される余地を減らす。
- `Verify` をコマンドごとに空行付きで重複記述する形式を避け、読みやすい記録形式へ揃える。

## 変更範囲

- `tasks/README.md` のコミットメッセージ規約を更新する。
- `AGENTS.md` の要約にも body 必須項目を追記する。

## 設計同期

- [x] 実装、設定、compose、設計文書の更新要否を確認する。

## 受け入れ条件

- [x] タスクに紐づく commit body では `Why` / `What` / `Verify` / `Risk` が必須であることが明文化されている。
- [x] `Verify` の複数コマンド記録で無駄な空行や `Verify:` の重複を避ける形式が明文化されている。
- [x] task tooling checks が通る。

## 確認

- [x] `npm run tasks:index`
- [x] `npm run tasks:index:check`
- [x] `npm run tasks:check`

## 実行できなかった検証

- なし

## subagent 成果物

- review: `review.md`
- implementation log: `impl.md`
- evaluation: `eval.md`
- acceptance artifacts: `acceptance/`
