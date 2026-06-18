# Implementation Log

## 2026-06-18 タスク整理

- `TASK-3100` を roadmap Phase 0 の umbrella task として整理した。
- `meta.yaml` の `depends_on` に `task-3116-sincro-pose-ik-observability-verification-and-design-sync` を追加し、最終実機確認なしに Epic を閉じない依存関係にした。
- 子タスク一覧の参照先を旧 `documents/tasks/...` ではなく、現行 `tasks/character-sincro-motion/...` の canonical task path へ更新した。
- Phase A 以降の replay / metrics、`CanonicalUpperBodyState`、`ReliabilityMap`、`TemporalStateEstimator` などは本 Epic へ追加せず、roadmap の大フェーズに沿う別タスクとして扱う方針を明記した。

確認:

- `npm run tasks:index`
- `npm run tasks:index:check`
- `npm run tasks:check`

残リスク:

- `TASK-3116` の実機確認と評価は未実施のまま。本 Epic は `TASK-3116` 完了後に close 判断する。
