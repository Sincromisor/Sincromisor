# Frontend Coding Standards

`documents/rules/coding-ts.md` と `AGENTS.md` の TypeScript 規約に合わせて、`sincromisor-frontend` の既存コードを段階的に整理するためのタスク群です。

## 現状メモ

- `npm run build` は成功する。
- 初回棚卸し時点では `npm run check:biome` に warning / info が残っていたが、現在は `npm run check` が成功する。
- 規約違反は命名・型境界・logger・null 方針・ファイルサイズに広く分散しているため、1 タスクで全面修正しない。
- runtime validation は、通常版 Zod を外部 I/O 境界へ限定導入する方針とする。worker message や DOM event まで一律に Zod 化しない。

## 2026-05-19 移行元メモ

- `npm run test` / `npm run check` / `npm run build` は成功する。
- `TASK-260517134246 frontend file function size split` は hard 閾値残件を解消し、旧 `done/` 状態に戻した。
- `TASK-260517134247 frontend camelCase path rename plan` の後続として、`TASK-260519191620 frontend camelCase path full migration` を起票した。
- `TASK-260517134244 frontend runtime boundary schema and any removal` の後続として、`TASK-260519191621 frontend type assertion and suppression cleanup` を起票した。

> Migrated from `documents/tasks/frontend_coding_standards/README.md`.
> Legacy task count in this category: 10.

<!-- AUTOGEN:tasks START — scripts/tasks/genIndex.mjs が再生成します。手で編集しないでください -->

## タスク一覧（自動生成 / 全 13 件）

### done（完了） — 13 件

| タスク                                                                                                                                                 | タイトル                                               | 判定    | 依存 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ | ------- | ---- |
| [task-260517134241-frontend-coding-standard-refactor-epic](./task-260517134241-frontend-coding-standard-refactor-epic/task.md)                         | frontend coding standard refactor epic                 | ✅ PASS | —    |
| [task-260517134242-frontend-biome-diagnostics-cleanup](./task-260517134242-frontend-biome-diagnostics-cleanup/task.md)                                 | frontend biome diagnostics cleanup                     | ✅ PASS | —    |
| [task-260517134243-frontend-logger-and-console-replacement](./task-260517134243-frontend-logger-and-console-replacement/task.md)                       | frontend logger and console replacement                | ✅ PASS | —    |
| [task-260517134244-frontend-runtime-boundary-schema-and-any-removal](./task-260517134244-frontend-runtime-boundary-schema-and-any-removal/task.md)     | frontend runtime boundary schema and any removal       | ✅ PASS | —    |
| [task-260517134245-frontend-null-undefined-normalization](./task-260517134245-frontend-null-undefined-normalization/task.md)                           | frontend null undefined normalization                  | ✅ PASS | —    |
| [task-260517134246-frontend-file-function-size-split](./task-260517134246-frontend-file-function-size-split/task.md)                                   | frontend file function size split                      | ✅ PASS | —    |
| [task-260517134247-frontend-camelcase-path-rename-plan](./task-260517134247-frontend-camelcase-path-rename-plan/task.md)                               | frontend camelcase path rename plan                    | ✅ PASS | —    |
| [task-260517134248-frontend-test-runner-foundation](./task-260517134248-frontend-test-runner-foundation/task.md)                                       | frontend test runner foundation                        | ✅ PASS | —    |
| [task-260519191620-frontend-camelcase-path-full-migration](./task-260519191620-frontend-camelcase-path-full-migration/task.md)                         | frontend camelcase path full migration                 | ✅ PASS | —    |
| [task-260519191621-frontend-type-assertion-and-suppression-cleanup](./task-260519191621-frontend-type-assertion-and-suppression-cleanup/task.md)       | frontend type assertion and suppression cleanup        | ✅ PASS | —    |
| [task-260628231541-frontend-typescript-comment-policy-audit-checklist](./task-260628231541-frontend-typescript-comment-policy-audit-checklist/task.md) | frontend TypeScript comment policy and audit checklist | ✅ PASS | —    |
| [task-260629022214-tighten-typescript-source-comment-quality-rules](./task-260629022214-tighten-typescript-source-comment-quality-rules/task.md)       | tighten TypeScript source comment quality rules        | ✅ PASS | —    |
| [task-260706031110-motion-debug-viewer-model-size-split](./task-260706031110-motion-debug-viewer-model-size-split/task.md)                             | motion-debug viewer model size split                   | ✅ PASS | —    |

<!-- AUTOGEN:tasks END -->
