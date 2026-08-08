# タスク管理エージェント手順を簡素化

<!-- tasks/AUTHORING-CHECKLIST.md を目安に、変更のリスクに必要な項目だけ具体化する。 -->

## 背景 / 目的

通常の局所変更にも独立レビュー、鮮度確認、独立評価、複数の作業ログを強制しており、タスク成果物だけで22,398行が蓄積している。既存の `tasks/README.md` にあるリスク比例の方針へ実際のコマンドとエージェントを合わせる。

## 完了条件（受け入れ条件）

<!-- 検証可能・期待値が一意な形で書く（「改善する」ではなく「〜のとき〜を返す」）。異常系/境界も。 -->

- [ ] 通常の `/run-task` が実装担当と単一worktreeだけで実装・gate・完了処理できる。
- [ ] 独立レビューと独立評価は、明示要求または高リスク統合タスクだけで起動される。
- [ ] `review-task`、`next-task`、`task-freshness-checker` の生成物が削除され、次タスクは `tasks:next` を直接使う。
- [ ] 新規タスクは未レビューでも依存解決済みなら `tasks:next --ready-only` に表示される。
- [ ] コメント規約は実装時に正本文書を直接適用し、task/impl/evalへ監査台帳を複製しない。
- [ ] `gen:codex:check`、タスクスクリプトのテスト、`tasks:check` が通る。

## 設計判断

過去タスクとの互換性のため `reviewed_sha` と空の `review.md` / `impl.md` / `eval.md` はスキーマ上残す。通常経路では内容を必須にせず、評価時も実装worktreeを再利用する。

## スコープ境界

`.claude` の正本、Codex生成物、生成器、タスク抽出スクリプト、運用文書を対象とする。既存タスク成果物の一括削除やmeta移行は行わない。

## 実装方針

`.claude/commands` と `.claude/agents` を短縮・削除し、既存 `gen:codex` のorphan pruneで生成物を同期する。`nextTasks.mjs` はreview状態による分類を削除する。

## テスト

`nextTasks.mjs` の未レビューREADY回帰テスト、`gen:codex:check`、`tasks:check`、Markdown整形確認を実行する。

## ドキュメント同期の要否

必要。`AGENTS.md`、`tasks/README.md`、`README_Codex.md`、`.agents/CUSTOMIZATIONS.md` を新しい入口・役割・worktree方針へ同期する。
