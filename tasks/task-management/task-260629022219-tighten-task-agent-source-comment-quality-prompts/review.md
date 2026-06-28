# Review: task-260629022219-tighten-task-agent-source-comment-quality-prompts

## 判定
APPROVED

Critical / High の blocking 指摘はない。受け入れ条件は対象 agent prompt、authoring checklist、customization 記録、生成物同期まで具体化されており、参照している既存ファイル・生成コマンドとも整合している。

## 指摘事項
なし。

## 実装者への申し送り
- 依存 `task-260629022214-tighten-typescript-source-comment-quality-rules` は `meta.yaml` 上まだ open / review null のため、本タスクの実装着手は依存側が close または少なくとも基準確定済みであることを確認してから行うこと。
- `scripts/gen/genCodex.mjs` は `.agents/skills/**` と `.codex/agents/*.toml` に加えて `.codex/hooks.json` も生成管理している。今回の `.claude/agents/*.md` 変更では hooks 差分は通常出ない想定だが、`npm run gen:codex` 後に差分が出た場合は生成物として扱い、手書き編集しないこと。
- `tasks/AUTHORING-CHECKLIST.md:61` 以降は task-reviewer 評価観点の正本なので、`.claude/agents/task-reviewer.md` への追記と用語・High 条件を同期させること。
- `.agents/CUSTOMIZATIONS.md:83` から `:86` の既存記録は、upstream refresh 時に守るべき comment quality gate をすでに扱っている。symbol / decision audit と evaluator spot check の維持条件を追記する形で、既存の意図を弱めないこと。
