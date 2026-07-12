# Review: task-3100-sincro-motion-foundation-epic

## 判定

APPROVED

Critical / High の blocking 指摘はない。`task-3116` は `meta.yaml` 上 `done/PASS` で、3100 の umbrella 方針は「新規実装を増やさず Phase 0 到達点を固定する」ものとして成立している。

## 指摘事項

- [Medium] `tasks/character-sincro-motion/task-3100-sincro-motion-foundation-epic/task.md:100` の子タスク一覧では `task-3116` が `Open` のままだが、`tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/meta.yaml:4`、同 `:13` では `done` / `PASS`。`tasks/README.md:8` により状態の正本は `meta.yaml` なので実装を止める矛盾ではないが、close 報告や `impl.md` では `task.md` の手書きステータスが古いだけであることを明示するとよい。
- [Medium] `tasks/character-sincro-motion/task-3100-sincro-motion-foundation-epic/task.md:149` の確認コマンド案は frontend build と画面確認中心で、task close 時の task metadata / index 確認が明示されていない。`tasks/README.md:112`、`:117`-`:120` は close commit で task 状態更新と index 確認を記録する例を示しているため、実装者は 3100 close 時に `npm run tasks:index:check` / `npm run tasks:check` 相当の確認結果も `impl.md` に残すこと。
- [Low] `tasks/character-sincro-motion/task-3100-sincro-motion-foundation-epic/task.md:23`-`:40` の関連設計 / 関連コードはファイル単位参照で、`tasks/AUTHORING-CHECKLIST.md:30`-`:35` が求める `file:line` 裏取りまでは本文に入っていない。今回の umbrella close では、設計文書側に `chat` / `sincro` 分離、tracker / retarget / IK / `motion-debug` の責務が同期済みであることを確認したため blocking ではない。

## 実装者への申し送り

- `task-3116` の PASS 根拠は `tasks/character-sincro-motion/task-3116-sincro-pose-ik-observability-verification-and-design-sync/eval.md:5`-`:14`、実カメラ姿勢 matrix は同 `:100`-`:120`、複数 VRM 確認は同 `:122`-`:160`、single-arm missing の受け入れ判断は同 `:179`-`:193` にある。3100 の close ではこれらを Phase 0 gate の充足根拠として要約する。
- 3116 の残リスクとして、full `npm run gate` は task 外 Markdown formatting warning で未通過、task-local checks は PASS と記録されている（`task-3116/.../eval.md:11`-`:14`）。3100 close でもこの残リスクを再掲し、3100 自体の追加 blocker ではない理由を残す。
- 設計同期は `documents/design/frontend/character/overview.md:44`-`:52`、`documents/design/frontend/character/tracking.md:5`-`:7` / `:38`-`:57` / `:91`-`:100`、`documents/design/frontend/character/motion.md:5`-`:7` / `:21`-`:59` / `:81`-`:95`、`documents/research/character_animation/roadmap.md:249`-`:259` に反映済み。公開 RTC 契約変更は非対象（`task.md:52`-`:59`）であり、追加の contract doc 更新は不要。
- `task.md:145`-`:147` の通り、Phase A 以降の replay / metrics、`CanonicalUpperBodyState`、`ReliabilityMap`、`TemporalStateEstimator` は 3100 に追加せず後続 task 化する。
