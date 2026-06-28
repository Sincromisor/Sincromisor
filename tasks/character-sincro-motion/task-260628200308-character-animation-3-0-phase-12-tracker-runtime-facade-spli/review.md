# Review: task-260628200308-character-animation-3-0-phase-12-tracker-runtime-facade-spli

## 判定

NEEDS_REVISION

`npm run tasks:check:frontend-structure` の扱いが現在 HEAD の実行結果と矛盾しており、放置すると実装・評価の合否基準が非一意になる。public API / stats shape / fallback / `ignorePerformanceFallback` / design doc 同期は概ね検証可能だが、この High 指摘は blocking。

## 指摘事項

- [High] `task.md:64`-`73` は `npm run tasks:check:frontend-structure` を通常の検証コマンドとして列挙しているが、現在 HEAD ではタスク実装前から 28 件の strict failure が出る。`tasks/README.md:248`-`252` と `scripts/tasks/checkFrontendStructure.mjs:42`-`57` / `:97`-`115` の仕様上、strict 対象は `git diff main --name-only -- sincromisor-frontend/src` 全体であり、`task.md:42`-`53` が定める TrackerRuntime 内部分割だけでは `sincroTracker.worker.ts`、`trackerRuntimeDegradationPolicy.ts`、motion-debug / reliability / avatarProfile などの既存 strict failure を解消できない。PASS 必須なのか、今回変更ファイル由来でない既存 strict failure を `impl.md` / `eval.md` に切り分ければ可なのかを受け入れ条件へ明記する必要がある。
- [Medium] 既存コード・設計文書の `file:line` にズレがある。`task.md:5` / `:62` の `documents/design/frontend/character/tracking.md:42` は TrackerRuntime 責務ではなく、現状の TrackerRuntime 節は `documents/design/frontend/character/tracking.md:65` 以降。`task.md:58` の `trackerRuntime.ts:101` は start lifecycle ではなく private field 付近で、`startFaceTracking()` は現状 `trackerRuntime.ts:122` から始まる。対象箇所は特定できるため単独では blocking ではない。

## 実装者への申し送り

- 改訂時は structure guard の合格条件を一意にすること。例: `trackerRuntime.ts` と本タスクで新規作成・変更した production module は 300 行以下または固定形式の例外コメント必須、ただし実装前から存在する branch-wide strict failure はコマンド出力と変更ファイル照合を `impl.md` / `eval.md` に記録すれば可、など。
- `SincroTrackerWorkerStats`、`budget`、`degradationPolicy`、`roi` の shape は developer-visible な debug / metrics 境界なので、型差分と snapshot 差分を出さない。
- `ignorePerformanceFallback` は face-only / comfortable-idle 抑制だけに留め、reduced fps と ROI pause stage を消さないことを `trackerRuntimeDegradationPolicy` / `trackerRuntimeRoiBudget` 系テストで確認する。
- helper module のために facade から private state を広く公開しない。必要な入力は責務名付きの domain-internal 型にまとめる。
