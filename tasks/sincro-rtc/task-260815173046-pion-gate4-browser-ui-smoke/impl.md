# 実装記録

- `documents/migration/pion/phase-4-cutover-runbook.md`へ、Pionとrollback後aiortcで共通に使う
  browser UI smoke手順を追加した。実下流の本文は比較せず、text、telop、非無音音声、session収束を確認する。
- `npm run tasks:check`はPASSした。`npm run tasks:index:check`は既存の`tasks/bug/index.md`と
  `tasks/sincro-rtc/index.md`の不整合でFAILした。`npm run gate`は既存3 task.mdのPrettier未整形でFAILした。
  いずれも本タスクの変更範囲外のため修正していない。
