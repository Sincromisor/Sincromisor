# run-task-agentsの独自変更

本書は、`/Users/aki/projects/run-task-agents` に対するSincromisor固有の差分を記録する。
作業手順キットを更新するときは、Codex用成果物の再生成前に各項目を確認する。

## タスクのメタデータ互換性

- 対象ファイル: `scripts/tasks/lib.mjs`、`scripts/tasks/setMeta.mjs`、`scripts/tasks/newTask.mjs`、`scripts/tasks/checkTasks.mjs`、既存の `tasks/**/meta.yaml`
- 上流との差分: 上流の `reviewed_sha` を追加しつつ、`legacy_ids` を保持する。`legacy_ids` は上流と互換性のある独自の追加フィールドとして残し、新規タスクにも `legacy_ids: []` を設定して、直ちに `tasks:check` を通過できるようにする。
- 理由: 移行済みの旧タスクIDと履歴参照を有効に保つため。
- 更新時の確認: `npm run tasks:check` を実行し、`legacy_ids` と `reviewed_sha` の両方が検証されることを確認する。

## 既存のタスク管理ツール

- 対象ファイル: `scripts/tasks/checkTasks.mjs`、`scripts/tasks/migrateLegacyTasks.mjs`、`package.json`
- 上流との差分: 上流にはSincromisorの `tasks:check` と `tasks:migrate:legacy` がないため、両方をパッケージのスクリプトとして保持する。上流の `tasks:migrate:reviewed-sha` と `tasks:reindex` も公開する。
- 理由: 移行済みのタスク履歴について、スキーマと旧形式からの移行を引き続き検証する必要があるため。
- 更新時の確認: 旧形式の移行支援をすべて意図的に廃止する場合を除き、これらのスクリプトを保持する。

## 全体検査の構成

- 対象ファイル: `package.json`
- 上流との差分: `gateSteps` は `sincromisor-frontend` の `check`、`build`、`test` を実行する。Python全体の検査は、結果をキャッシュする既定の全体検査に含めない。
- 理由: 高リスクまたは横断的な変更に対する、リポジトリ全体の健全性検査であるため。Markdown検査が無関係なファイルも走査することから、通常変更は対象を絞って確認する。サーバーコードを変更する場合は、タスクごとにPythonの確認を選ぶ。
- 更新時の確認: サーバーのタスクが増えたら、対象を絞ったPythonの検査段階、またはサーバー専用の検査を検討する。

## ブランチの接頭辞

- 対象ファイル: `package.json`、`AGENTS.md`、`tasks/README.md`
- 上流との差分: `taskBranchPrefix` を `codex/` に設定する。実装ワークツリーは上流の `task/<task-id>` に代えて `codex/<task-id>` を使う。
- 理由: Codexのデスクトップ環境では、アシスタントが所有するブランチに `codex/` 接頭辞を使うため。
- 更新時の確認: 接頭辞をリポジトリとアプリ側のGitの指針に合わせる。

## 完了処理コミットの雛形

- 対象ファイル: `package.json`
- 上流との差分: Sincromisorは`taskClose.commitTemplate`に、一段落の日本語散文と`Refs:`フッターを定義する。
- 理由: コミット本文に変更理由、確認、残リスクを残しつつ、英語の項目ラベルと不要な改行を生成しないため。
- 更新時の確認: `npm run tasks:close -- <task-dir> verdict=PASS attempts=1 --dry-run`を実行し、生成される本文が`tasks/README.md`の規約を満たすことを確認する。

## タスク雛形の構成

- 対象ファイル: `scripts/tasks/newTask.mjs`
- 上流との差分: 上流の `task.md` と `meta.yaml` に加え、`review.md`、`impl.md`、`eval.md`、`acceptance/.gitkeep`、`artifacts/.gitkeep` を生成する。
- 理由: `tasks:check` が全タスクについてディレクトリ構成全体を検証するため。
- 更新時の確認: 試行用または一時的なタスクを作成し、`npm run tasks:check` を実行する。

## 原本文書へのリンク

- 対象ファイル: `.claude/agents/*.md`、`.claude/commands/*.md`、`tasks/AUTHORING-CHECKLIST.md`、`AGENTS.md`、`tasks/README.md`
- 上流との差分: 参照先を `AGENTS.md`、`README.md`、`documents/design/`、`documents/rules/`、`tasks/README.md` とする。
- 理由: Sincromisorのプロジェクト説明、設計、コーディング規約の原本であるため。
- 更新時の確認: 生成済みスキルに、古い汎用文書のパスや複数のパッケージ管理ツールの例が残っていないか確認する。

## Codex用の生成成果物

- 対象ファイル: `.agents/skills/**`、`.codex/agents/*.toml`、`.codex/hooks.json`
- 上流との差分: `.claude/` から生成する成果物をGit管理する。
- 理由: Codexのセッションで、別途生成を実行せずにローカルのスキルとエージェント定義を利用できるようにするため。
- 更新時の確認: `.claude/` の編集後に `npm run gen:codex` と `npm run gen:codex:check` を実行する。
- 実装時は `documents/rules/source-comments.md` と言語別の規約を直接適用する。タスクの受け入れ条件や `impl.md` / `eval.md` の監査台帳に複製しない。
- 独立レビュー・評価は、明示要求と高リスクの統合変更に限る。評価は実装ワークツリーを再利用する。`task-freshness-checker`、評価専用ワークツリー、レビュー・評価成果物の一律必須化は意図的に採用しない。

## 完了前の失敗調査

- 対象ファイル: `.claude/commands/run-task.md`、`.claude/agents/*.md`、`tasks/README.md`、`tasks/AUTHORING-CHECKLIST.md`
- 上流との差分: 今回の差分が原因で、受け入れ条件、セキュリティ、データ損失、公開契約、本番切替に直接関係する失敗だけを完了の停止条件にする。既存または対象外の失敗は、作業を止めずに報告する。失われやすい証拠の採取は、高リスクの実行時障害に限る。
- 理由: 趣味開発では、無関係な整形不備や変更前からの失敗で自律的な作業を止めないため。
- 更新時の確認: 必須確認の失敗について、原因の特定と再実行の証拠がなければ、生成済みエージェントの指示がPASSを認めないことを確認する。

## タスクの実装可能性と自律補完

- 対象ファイル: `.claude/commands/new-task.md`、`.claude/commands/run-task.md`、`.claude/agents/task-reviewer.md`、`.claude/agents/task-implementer.md`、`tasks/AUTHORING-CHECKLIST.md`、`tasks/README.md`、`scripts/tasks/newTask.mjs`
- 上流との差分: 起票時に外部入力の供給元と消費先を追跡する。既存のタスク文書で解決できる不足は `AUTO_FIX` とする。公開契約、責務、受け入れ条件、外部入力の供給経路に影響する選択だけを `NEEDS_REVISION` とする。
- 理由: 通常の実装確認で作業が止まることを防ぎつつ、構成上の未決定事項では確実に停止するため。
- 更新時の確認: `npm run gen:codex`、`npm run gen:codex:check`、`npm run tasks:check` を実行する。

## 趣味開発に合わせた作業手順

- 対象ファイル: `AGENTS.md`、`tasks/README.md`、`tasks/AUTHORING-CHECKLIST.md`、`documents/rules/source-comments.md`、`.claude/commands/*.md`、`.claude/agents/*.md`、`scripts/tasks/newTask.mjs`
- 上流との差分: 通常変更は現在のワークツリーで直接進め、対象を絞った確認と1コミットで完了する。専用ワークツリー、サブエージェント、独立評価、リポジトリ全体の検査は、分離が必要な統合作業または高リスク変更に限る。
- 理由: Sincromisorは個人の趣味開発であり、通常は実装を届ける速さを優先するため。ただし、セキュリティ、データ損失防止、公開契約、明示要求された評価は必須条件のままとする。
- 本番コードの変更では、ソースコメントの確認を常に必須とする。変更した全シンボルと直接の変更理解範囲を点検し、必須コメントの欠落や陳腐化があれば完了しない。簡略化するのは監査台帳であり、コメントの義務は維持する。
- 更新時の確認: 生成済みの指示が、通常変更に専用ワークツリー、`npm run gate`、独立評価を要求しないことを確認する。
