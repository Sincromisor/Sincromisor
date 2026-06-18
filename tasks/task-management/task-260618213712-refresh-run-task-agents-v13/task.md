# Refresh run-task-agents v1.3 workflow

## 目的

`~/projects/run-task-agents` v1.3.0 の最新版 workflow を Sincromisor に取り込み、前回導入済みの task agent 基盤を更新する。
原則 upstream に寄せ、Sincromisor 固有の legacy task 互換、frontend gate、Codex branch prefix だけを明示的な差分として残す。

## 変更範囲

- `.claude/commands/` と `.claude/agents/` を v1.3.0 ベースへ更新する。
- `scripts/tasks`, `scripts/gate`, `scripts/eval`, `scripts/gen`, `scripts/metrics` を v1.3.0 ベースへ更新する。
- `package.json` に upstream の新 scripts、`taskBranchPrefix`, `yaml` 依存、Sincromisor 用 `gateSteps` を揃える。
- `tasks:check`, `tasks:migrate:legacy`, `legacy_ids` 互換は維持する。
- `tasks/README.md`, `AGENTS.md`, `.agents/CUSTOMIZATIONS.md` を新 workflow に同期する。
- `npm run gen:codex` で `.agents/skills/` と `.codex/` 生成物を更新する。

## 設計同期

- [ ] 実装、設定、compose、設計文書の更新要否を確認する。
- [ ] upstream との差分を `.agents/CUSTOMIZATIONS.md` に記録する。

## 受け入れ条件

- [ ] 実装フェーズ用 `eval:worktree add <sha> --branch <name>` と close / reindex 分離が取り込まれている。
- [ ] 新規 task scaffold が Sincromisor の `tasks:check` を満たす。
- [ ] `legacy_ids` が既存 task と新規 task の両方で保持される。
- [ ] `tasks:reindex`, `tasks:migrate:reviewed-sha`, `gen:codex:check` が package scripts として利用できる。
- [ ] Codex 生成物が `.claude/` と同期している。
- [ ] 既存のユーザー未コミット変更を巻き込まない。

## 確認

- [ ] `npm install`
- [ ] `npm run tasks:check`
- [ ] `npm run tasks:index`
- [ ] `npm run tasks:index:check`
- [ ] `npm run gen:codex`
- [ ] `npm run gen:codex:check`
- [ ] `npm run tasks:next -- --json`
- [ ] `npm run tasks:close -- --dry-run tasks/task-management/task-260618213712-refresh-run-task-agents-v13 verdict=PASS attempts=1`

## 実行できなかった検証

- 実装時に記録する。

## subagent 成果物

- review: `review.md`
- implementation log: `impl.md`
- evaluation: `eval.md`
- acceptance artifacts: `acceptance/`
