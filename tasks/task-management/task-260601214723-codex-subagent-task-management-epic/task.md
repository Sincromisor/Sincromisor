# TASK-260601214723 Codex subagent task management Epic

## 目的

Sincromisor のタスク管理を、Codex の subagent 利用を前提にした review -> implement -> evaluate パイプラインへ整理する。

現行の `documents/tasks/<category>/{open,done}/TASK-*.md` は、人間と単一エージェントの作業ログとしては機能している。一方で、Codex で reviewer / implementer / evaluator の独立性を担保するには、タスク仕様、レビュー結果、実装ログ、評価結果、状態メタデータを分離した構成が必要になる。

本 Epic では `~/projects/run-task-agents` の考え方を Sincromisor 向けに再設計し、Claude Code 固有の `.claude/commands` / `.claude/agents` ではなく、Codex subagents、Codex skills、タスク操作スクリプト、Git 境界で実現する。

## 前提

- Codex の subagent 機能を利用できる開発環境で運用する。
- `run-task-agents` は Claude Code 前提のため、構成思想は流用するが実行機構は Codex 向けに置き換える。
- 新しい正本タスクルートは `tasks/` とする。
- 移行が完了するまでは、現行ルールに従い本 Epic と子タスクは `documents/tasks/task_management/open/` で管理する。

## 変更範囲

- タスク管理レイアウトを `tasks/<category>/task-<id>-<slug>/` 形式へ移行する。
- `task.md`, `meta.yaml`, `review.md`, `impl.md`, `eval.md`, `acceptance/`, `artifacts/` の役割を定義する。
- Codex subagent 用の reviewer / implementer / evaluator 手順を skill 化する。
- `documents/tasks` の既存タスクを新レイアウトへ移行する。
- `AGENTS.md`、`.github/copilot-instructions.md`、`documents/rules/`、関連設計文書の参照を更新する。
- 新パイプラインで小さな実タスクを試行し、運用上の不足を補正する。

## 子タスク

1. `TASK-260601214724`: 新タスクレイアウトと操作スクリプトを導入する。
2. `TASK-260601214725`: Codex subagent runner と役割別 skill を整備する。
3. `TASK-260601214726`: 既存 `documents/tasks` を新 `tasks` レイアウトへ移行する。
4. `TASK-260601214727`: `AGENTS.md` とルール文書のタスク参照を更新する。
5. `TASK-260601214728`: index 生成、リンク修正、検証手順を整備する。
6. `TASK-260601214729`: 新パイプラインで pilot task を実行して運用を確認する。

## 完了条件

- 子タスクが完了している。
- 新規タスクは `tasks/` 配下に起票できる。
- Codex parent が reviewer / implementer / evaluator subagent を分離して実行できる。
- Codex skill の配置先が Git 追跡対象として再現可能になっている。
- reviewer / implementer / evaluator の成果物がファイルで受け渡され、`meta.yaml` が状態の正本になっている。
- 既存のタスク参照が新レイアウトへ更新され、壊れリンクが残っていない。
- pilot task の review / implementation / evaluation / close が新方式で完了している。

## 確認

- [ ] `tasks:new` で新規タスクが作成できる。
- [ ] `tasks:set` で `meta.yaml` を決定的に更新できる。
- [ ] `tasks:index` / `tasks:index:check` が通る。
- [ ] 旧 `documents/tasks` 参照の残存を `rg "documents/tasks|TASK-"` で確認し、必要な参照を更新済みまたは意図的残置として説明できる。
- [ ] pilot task の `review.md`, `impl.md`, `eval.md` が揃っている。

## 結果

-
