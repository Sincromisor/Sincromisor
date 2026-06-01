# Add task completion reporting contract

## 目的

Codex subagent パイプラインと通常 Codex 作業の完了時に、ユーザーが作業概要、結果、確認、
特記事項を把握できるようにする。

## 変更範囲

- `tasks/README.md`
- `.agents/skills/sincromisor-task-runner/SKILL.md`
- `.agents/skills/task-reviewer/SKILL.md`
- `.agents/skills/task-implementer/SKILL.md`
- `.agents/skills/impl-evaluator/SKILL.md`
- `scripts/tasks/newTask.mjs`
- 本タスクの `impl.md`, `meta.yaml`, `tasks/task-management/index.md`

## 設計同期

- [x] 実装、設定、compose、設計文書の更新要否を確認する。
- [x] タスク管理運用のみの変更であり、`documents/design/` の同期は不要。

## 受け入れ条件

- [x] parent Codex が reviewer / implementer / evaluator の各完了時にユーザーへ概要を報告するルールがある。
- [x] 通常 Codex 作業でも完了時に作業概要、結果、確認、特記事項を報告するルールがある。
- [x] `review.md`, `impl.md`, `eval.md` のテンプレートに報告用 summary 欄がある。
- [x] role skill が summary 欄の記載内容を明示している。

## 確認

- [x] `npm run tasks:index`
- [x] `npm run tasks:index:check`
- [x] `npm run tasks:check`
- [x] `npm run check:md` in `sincromisor-frontend`

## 実行できなかった検証

- 現時点ではなし。

## subagent 成果物

- review: `review.md`
- implementation log: `impl.md`
- evaluation: `eval.md`
- acceptance artifacts: `acceptance/`
