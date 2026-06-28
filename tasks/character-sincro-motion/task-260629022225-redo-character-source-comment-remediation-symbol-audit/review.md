# Review: task-260629022225-redo-character-source-comment-remediation-symbol-audit

## 判定

APPROVED

Critical / High に該当する blocking 欠陥は見つからない。対象 10 file、symbol / decision 単位の audit schema、コメントの keep / rewrite / delete / add 判定、module TSDoc 集約条件、挙動変更禁止、テスト範囲が task.md に具体化されており、実装者の裁量で成果物が変わる未確定設計は残っていない。

## 指摘事項

なし

## 実装者への申し送り

- `meta.yaml` 上の依存 `task-260629022214-tighten-typescript-source-comment-quality-rules` と `task-260629022219-tighten-task-agent-source-comment-quality-prompts` は、確認時点でどちらも `status: open` / `review: null`。本タスクの仕様欠陥ではないが、実装着手は依存タスクが close され、規約・agent prompt の正本が確定してから行うこと。
- task.md の対象 10 file は現存し、主要な `file:line` 前提も現状と整合している。特に `motionIntentEstimatorConfig.ts:1`、`trackerRuntimeDegradationPolicy.ts:1`、`motionMetricThresholds.ts:1` の弱い module TSDoc と、各 file の public export / parser / threshold / lifecycle 対象を audit の入口にすること。
- `artifacts/symbol-comment-audit.md` は file 単位の要約で済ませず、task.md 指定の列で symbol / decision ごとに記録すること。`rewrite` / `add` では、名前・型から分からない保守知識を具体化し、単なる「design doc / tests を確認する」にしないこと。
- production code の許可変更はコメント追加・更新・削除と、挙動を変えない private rename / helper 抽出に限定されている。runtime behavior、type shape、schemaVersion、threshold 値、export 名、公開 API は変更しないこと。
- 設計本文の同期は原則不要とされているが、実装と design doc の矛盾を見つけた場合は同タスクで隠蔽せず、`impl.md` に同期先と理由を follow-up として記録すること。
