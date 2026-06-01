# TASK-260601214727 update agents and rules task references

## 目的

タスク管理の正本を `tasks/README.md` へ移した後、`AGENTS.md` と横断ルール文書の参照を新運用へ同期する。

## 親タスク

- `TASK-260601214723`

## 依存

- `TASK-260601214724`
- `TASK-260601214725`
- `TASK-260601214726`
- `TASK-260601214728`

## 変更範囲

- `AGENTS.md`
- `.github/copilot-instructions.md`
- `documents/rules/coding-md.md`
- `documents/rules/coding-ts.md`
- `documents/rules/coding-py.md`
- 必要に応じて `documents/design/index.md` と関連設計文書

## 実装方針

- `AGENTS.md` は初動ガイドに留め、詳細は `tasks/README.md` と Codex task runner skill へ誘導する。
- タスク配置の説明を `documents/tasks/<category>/open` から `tasks/<category>/task-<id>-<slug>/` に更新する。
- TODO 形式は既存の `TODO(TASK-yymmddhhmmss)` 互換を保つか、新 ID `TODO(task-...)` に寄せるかを明記する。
- Codex subagent パイプラインの品質ゲートを Sincromisor の実コマンドで明記する。
- `.github/copilot-instructions.md` は、詳細を重複させず新運用への入口だけ同期するか、対象外として残す理由を明記する。
- 旧タスク参照が残る場合は、履歴参照として意図的であることを説明する。

## 完了条件

- 新規作業者または Codex が `AGENTS.md` から新タスク運用へ迷わず辿れる。
- Markdown / TypeScript / Python ルール内のタスク参照が新レイアウトと矛盾しない。
- `documents/tasks/README.md` を正本とする記述が残っていない、または移行案内として意図的に残されている。
- Codex subagent の役割分離と品質ゲートが `AGENTS.md` から分かる。
- `.github/copilot-instructions.md` の扱いが同期済みまたは対象外として判断済みである。

## 確認

- [x] `rg "documents/tasks|tasks/README|open/|done/" AGENTS.md .github/copilot-instructions.md documents/rules documents/design -g '*.md'` で参照を確認する。
- [x] 新タスク起票手順と close 手順が矛盾していない。
- [x] フロント / Python / Compose の確認コマンドが新運用文書にも反映されている。
- [x] 参照先の `tasks/` パスが移行後に存在し、`tasks:fixlinks` または同等のリンク検証で壊れていない。

## 結果

- `AGENTS.md`、`.github/copilot-instructions.md`、`documents/rules/`、`documents/design/` の現行運用参照を `tasks/` 正本へ更新した。
- TODO 形式は canonical `task-<id>-<slug>` を新規推奨とし、legacy `TASK-...` を移行互換として明記した。
- `documents/design/archive/legacy-flat/` の旧 `documents/tasks/...` 参照は履歴として意図的に残した。
