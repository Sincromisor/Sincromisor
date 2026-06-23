# Implementation Log: task-260623221644-character-animation-3-motion-debug-layered-viewer

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- `review.md` は APPROVED のため実装を継続した。
- `MotionDebugSnapshot` の既存 field は維持し、追加は optional `viewer` に限定した。
- layer 判定は `task.md` の判定表を正本にし、Phase 1 予約 layer の slot 欠落は `not_implemented`、実装済み source の欠落は `not_recorded`、空 object は available 扱いしない実装にした。
- recording の scrubbed camera settings は `viewer.recording.scrubbedCameraSettings` の optional field として、live camera / replay manifest の camera layer から導出した。
- metrics view は manifest の `metricSummary` を読まず、`calculateReplayMetrics()` 成功時に保持した `MotionMetricSummary` を入力にした。
- gate の Markdown check が別タスク `task-260623221639-character-animation-3-motion-metrics-baseline` の既存 table で落ちたため、`||` を `\|\|` に escape し、Prettier 整形差分も同時に含めた。対象タスクの仕様変更ではなく gate を通すための文書整形補正。

### 変更概要

- `motion-debug` の snapshot panel を live / recording / replay / metrics mode と layer selector つき viewer へ拡張した。
- `MotionDebugViewerSnapshot` 型と viewer model / renderer を追加し、window API の `getSnapshot()` に optional `viewer` を含めた。
- replay manifest / current frame を viewer が参照できるよう、`MotionReplayPlayer` に読み取り専用 accessor を追加した。
- minimal valid NDJSON log を使う viewer model test を追加し、replay state と `calculateMotionMetricSummary()` 由来 metrics summary の表示用 state を検証した。
- `documents/design/frontend/character/motion.md` と `documents/design/frontend/pages.md` を同期した。

### 検証

- `cd sincromisor-frontend && npm run test -- motionDebug`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run test`
- Playwright CLI: `http://127.0.0.1:5176/motion-debug/` を開き、window API から manifest + 2 frame の minimal log を import、`startReplay({ mode: "pose-snapshot" })` と `calculateReplayMetrics()` の結果が viewer / metrics table に表示されることを確認した。
- Playwright CLI: viewport `390x844` で body 横 overflow が 0、metrics table の横 overflow が metrics panel 内に閉じることを確認した。
- worktree root で `npm run gate` PASS。

### 未実行 / 残リスク

- 実カメラを使った recording の手動確認は未実行。Playwright では synthetic minimal log import と replay / metrics 表示に絞った。
- baseline comparison は現行 window API が baseline を受け取らないため、UI では `not compared` を表示する。将来 baseline 入力が追加されたら `viewer.metricComparison` に接続する余地を残した。

### コミット

- `aa10f07f907e6bbe4a8053c81ed1405de9dd53a3`
