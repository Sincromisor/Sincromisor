# Review: task-260628200308-character-animation-3-0-phase-12-tracker-runtime-facade-spli

## 判定

APPROVED

前回 blocking だった `npm run tasks:check:frontend-structure` の合否基準は、現行 branch-wide strict failure を前提にした切り分け条件が受け入れ条件とテスト欄へ明記され、非一意性が解消された。改訂によって実装を破綻させる新たな Critical / High は見当たらない。

## 指摘事項

- [Medium] 前回指摘済みの既存コード・設計文書の `file:line` ズレは残っている。`task.md:5` / `task.md:65` の `documents/design/frontend/character/tracking.md:42` は TrackerRuntime responsibilities の実位置とずれており、`task.md:61` の `trackerRuntime.ts:101` も start lifecycle の開始位置としては古い参照のまま。ただし対象箇所は文脈から特定でき、受け入れ条件や成果物は変わらないため blocking ではない。

## 実装者への申し送り

- `npm run tasks:check:frontend-structure` は現行 HEAD でも branch-wide strict failure を返すことを確認済み。実装時は `task.md:31`-`32` / `task.md:75` の条件どおり、コマンド出力を `impl.md` に記録し、本タスクで変更した production file に failure が残っていないことと、本タスク範囲外の failure path 一覧を切り分けて記録する。
- `trackerRuntime.ts` と本タスクで新規作成・変更した production module は 300 行以下、または同じ行に `// reason: structure-threshold-exception <理由>` を持つ必要がある。既存の `sincroTracker.worker.ts` や `trackerRuntimeDegradationPolicy.ts` などを変更する場合も、この本タスク変更ファイル条件に入る。
- `SincroTrackerWorkerStats`、`budget`、`degradationPolicy`、`roi`、fallback stats の shape は developer-visible な debug / metrics 境界なので、型差分と snapshot 差分を出さない。
- `ignorePerformanceFallback` は face-only / comfortable-idle 抑制だけに留め、reduced fps と ROI pause stage を消さないことを `trackerRuntimeDegradationPolicy` / `trackerRuntimeRoiBudget` 系テストで確認する。
