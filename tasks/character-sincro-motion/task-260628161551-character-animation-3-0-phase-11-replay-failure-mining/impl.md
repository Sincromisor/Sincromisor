# Implementation Log: task-260628161551-character-animation-3-0-phase-11-replay-failure-mining

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- `review.md` は APPROVED。依存タスクの open 申し送りはオーケストレーター通知どおり解消済みとして扱った。
- candidate report は QA regression result を正本にし、raw replay log から独自に threshold 判定しない方針にした。
- `not_available` だけで warn になった fixture は `do_not_optimize` にまとめ、evidence は task.md の条件どおり warn / fail / comparison regressed の metric だけに限定した。
- `frameRange` は v1 の対象である `gestureFlickerCount` / `sideSwapCount` の最初の event だけに限定した。range が特定できない場合は report warning に残す。
- motion-debug API は既存 `runQaRegression(config)` を先に呼ぶ形にし、`no_recording_loaded` / `fixture_id_required` の意味と分岐を共有した。

### review.md 申し送りへの対応

- `candidateId` は fixture 内の生成順 0-based index で `fixtureId:target:index` に固定した。
- candidate order は `qaResult.fixtures` 順、fixture 内 target order 順に固定した。
- `evidence` message、`requiresHumanLabel`、`notes`、report `warnings` は task.md の固定値に合わせた。
- `frameRange` は gesture flicker と side swap の最初の検出 event のみ保存するようにした。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に Phase 11 candidate report v1、metric-to-target rule、`performance_policy` を learned post-processing 対象にしない方針、補正適用 / 学習 / dataset export / telemetry を行わないこと、motion-debug API のエラー仕様を同期した。

### 確認

- `cd sincromisor-frontend && npm run test -- motionOptimizationCandidateReport`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionQaRegression`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run gate` at `4b4f28cc9c21e46d7341af81bd2a19c49d8b3662`: lint / build / test all PASS

### 未実行

- ブラウザでの motion-debug 手動操作は未実行。今回の変更は developer API と pure helper の追加であり、受け入れ条件は unit / viewer model test と gate で確認した。

### 残リスク

- candidate report v1 は frame range を最初の event だけに要約する。全 event の mining や dataset export は後続タスクの対象。
- `performance_policy` は候補として残すが、意図どおり learned post-processing / human label 対象には接続していない。

### コミット

- `4b4f28cc9c21e46d7341af81bd2a19c49d8b3662` (`feat(character): add motion optimization candidate report`)
