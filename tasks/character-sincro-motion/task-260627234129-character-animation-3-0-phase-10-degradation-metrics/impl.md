# Implementation Log: task-260627234129-character-animation-3-0-phase-10-degradation-metrics

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md は APPROVED / Critical・High 指摘なしのため実装した。
- `trackerDroppedFrameCount` は review 申し送りどおり、`frame.metrics.tracker.droppedFrames` を累積値として frame 間差分へ正規化し、同一 frame では `frame.timestamp.droppedPresentedFrames` との大きい方だけを採用した。最初の tracker 累積値は計測窓前の累積を含み得るため baseline として扱い、同 frame の `droppedPresentedFrames` は通常どおり数える。
- `degradationStageFrameCount` は新 `degradationPolicy.stage` と旧 `budget.degradation.state` の両方を読む。`degradationRecoveryFrameCount` は旧 log から recovery を推測せず、`degradationPolicy.recovering` 欠損時は `not_available` にした。
- `roiPausedFrameCount` は `roi.pauseState` のみを読み、Hand lost / stale / fallback reason から推測しない。
- `npm run gate` の Markdown check が、未変更の既存 artifact `tasks/character-sincro-motion/task-260627234128-character-animation-3-0-phase-10-ordered-degradation-policy/eval.md` の Prettier 差分で失敗したため、ゲート通過に必要な単一ファイル整形だけを同一 commit に含めた。

### ドキュメント同期

- `documents/design/frontend/character/motion.md` に Phase 10 metrics key、入力、閾値、旧 log の `not_available` / fallback 方針、baseline parser の missing-key 補完方針を同期した。
- `documents/design/frontend/character/tracking.md` に stats 保存側 field と metrics 側の参照 boundary を同期した。公開通信契約や log schema version は変更していない。

### 確認

- `npm run test -- motionMetrics`: PASS（17 tests）
- `npm run test -- motionMetricBaselineSchema`: PASS（4 tests）
- `npm run test -- motionDebugViewerModel`: PASS（32 tests）
- `npm run check`: PASS
- `npm run build`: PASS
- `npm run gate`: PASS（commit `4193125` clean、lint / build / test。全体 test は 45 files / 357 tests）

### コミット

- `4193125` `feat(character): add Phase 10 degradation motion metrics`

### 残リスク

- `trackerDroppedFrameCount` は tracker 累積値の初回サンプルを差分 0 として扱う。計測開始前の累積 drop を regression に混ぜないための判断だが、log が drop 発生直後から始まり timestamp drop が欠損している場合、その初回分は数えない。
