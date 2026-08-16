# 個人開発向けにタスク運用を簡素化

## 背景 / 目的

趣味の個人開発に対して全体gate、専用worktree、独立評価、根拠のない非機能要件が標準化され、些細な不整合で作業が停止している。通常変更を最小経路へ戻し、高リスク変更だけ既存の厳格な仕組みを使う。

## 完了条件（受け入れ条件）

- [ ] 運用正本が通常・統合・高リスクの3経路を定義し、通常変更を直接実装、対象確認、1コミットで完了できる。
- [ ] 必須要件の根拠と、根拠のない性能値・網羅評価を要求しない方針が、起票・レビュー・実装・評価の各指示で一致する。
- [ ] 変更範囲外または既存の検査失敗は、今回の差分が悪化させない限り停止条件にならない。
- [ ] 本番コードのコメント必須範囲は緩和せず、監査台帳なしで親・実装担当・評価担当が欠落やstale commentを停止条件として点検する。
- [ ] `.claude/` と生成済みCodex指示が同期し、task tooling checksが通る。

## 設計判断

既存のworktree、subagent、gate、close機構は削除せず、高リスクまたは分離が必要な統合変更の経路として残す。通常変更ではtask状態と索引を実装と同じコミットに含める。

## スコープ境界

運用文書、コメント規約、agent指示、生成物、task雛形を同期する。既存taskの一括改訂、gate実装の削除、backlog整理は行わない。

## 実装方針

既存文書を短く書き換え、`.claude/` から `npm run gen:codex` で生成物を更新する。

## テスト

変更MarkdownのPrettier、`gen:codex:check`、task tooling tests、`tasks:index:check`、`tasks:check`を実行する。全frontend build/testは対象外。

## ドキュメント同期の要否

必要。`AGENTS.md`、`tasks/README.md`、`tasks/AUTHORING-CHECKLIST.md`、`documents/rules/source-comments.md`、`README_Codex.md`、`.agents/CUSTOMIZATIONS.md`、`.claude/`と生成物を同期する。
