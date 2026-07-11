# Review: task-260712074348-record-per-frame-gesture-and-total-tracker-durations

## 判定

APPROVED

前回の High 指摘 2 件と p95 の既存 metric set への接続方針は解消済みであり、改訂による新たな blocking issue は見当たらない。

## 前回指摘の解消確認

- Worker total は新しい `totalTrackerTimeMs` を追加せず、既存 `workerTimeMs` を維持して再利用する方針に固定された。開始点は `detect()` entry の `initialize()` 前、終了点は result 組み立て直前、初回 initialize cost は含めて集計でも除外しないと明記されている。これは現行 `sincroTracker.worker.ts:181-230` の実装と一致する。
- main-thread total は既存 `mainThreadDetectTimeMs` を再利用し、callback 内 detect 開始から optional pass 完了後、stats 合成直前までを同一 `performance.now()` clock で一度だけ計算する契約に固定された。現行 `trackerRuntimeMainThreadPipeline.ts:67-117` の所有境界と整合する。
- invalid duration の owner は新規 `motionTrackerPerformanceSamples.ts` に固定され、公開 parser の戻り値 `{samples,warnings}`、warning code、`frameIndex`、許可される `fieldPath` が最小 schema として明示された。field 単位の除外、log 全体を reject しない挙動、caller から warning を検証できる focused test も受け入れ条件になっている。
- p95 は既存 `MotionMetricSummary` / `MotionMetricKey` / threshold / comparison / baseline schema に追加せず、同新規 module の baseline 専用 `calculateTrackerPerformanceDurationSummary()` に分離された。既存 QA metric contract への波及を避ける理由も記載されている。

## 実装者への申し送り

- Worker 初回 frame の `workerTimeMs` は initialize cost を含むため、テストで initialize 済み/未済みの開始点を時刻値そのものへ過度に依存せず固定すること。task の契約どおり、集計側で初回だけ除外しないことも確認する。
- total sample は `tracker.mode` を必ず先に検証し、`worker` では `workerTimeMs`、`main-thread` では `mainThreadDetectTimeMs` だけを採用すること。別 mode の field が同時に存在しても混用しない。
- warning は不正 field ごとに生成し、同一 frame の他の valid duration を捨てないこと。旧 log の単純欠損は invalid warning と区別する。
- comment audit は Worker message boundary、duration owner、保存 parser、p95 aggregator を symbol / decision 単位で実コードと照合すること。

## Summary for Parent

- 判定: APPROVED
- Critical / High 指摘: なし
- 申し送り: Worker 初回 initialize cost を維持し、mode 別 total field の選択と field 単位 warning を focused test で固定すること。
