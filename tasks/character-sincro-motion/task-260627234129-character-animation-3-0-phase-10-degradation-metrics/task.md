# character animation 3.0 phase 10 degradation metrics

## 背景 / 目的

Phase 10 の degraded mode は、動けばよいだけではなく、端末負荷が上がったときに UI thread が固まらず、どの stage へ何フレーム落ちたかを replay log と metrics で検出できる必要がある。

現状の `MotionMetrics` は Phase 9 までの motion quality metrics を持つが、performance budget overrun、degradation stage 滞在、ROI pause、frame drop を regression として判定する fixed key がない。このタスクでは Phase 10 用 metrics key を追加し、`motion-debug` の metrics layer / replay metrics で degraded mode を数値化する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts` の `MotionMetricKey` に次の 5 key を追加する: `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`、`degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount`。
- [ ] 追加 5 key はすべて `unit: "count"`、`direction: "lower_is_better"` に固定し、`DEFAULT_MOTION_METRIC_THRESHOLDS` は `trackerBudgetOverrunFrameCount { pass: 0, warn: 30, fail: 90 }`、`trackerDroppedFrameCount { pass: 0, warn: 15, fail: 60 }`、`degradationStageFrameCount { pass: 0, warn: 45, fail: 150 }`、`degradationRecoveryFrameCount { pass: 0, warn: 60, fail: 180 }`、`roiPausedFrameCount { pass: 0, warn: 60, fail: 180 }` に固定する。
- [ ] `trackerBudgetOverrunFrameCount` は `frame.metrics.tracker.budget.budgetStatus === "over_budget"` の frame 数を数える。`budgetStatus === "warn"` は数えない。
- [ ] `trackerDroppedFrameCount` は `frame.timestamp.droppedPresentedFrames` と `frame.metrics.tracker.droppedFrames` の合計増分から求める。両方ある場合は frame 単位で大きい値を採用し、二重計上しない。
- [ ] `degradationStageFrameCount` は `frame.metrics.tracker.degradationPolicy.stage !== "full"` または旧 log の `frame.metrics.tracker.budget.degradation.state !== "full"` の frame 数を数える。
- [ ] `degradationRecoveryFrameCount` は `frame.metrics.tracker.degradationPolicy.recovering === true` の frame 数を数える。旧 log で `degradationPolicy` が無い場合は `not_available` にする。
- [ ] `roiPausedFrameCount` は `frame.metrics.tracker.roi.pauseState !== "active"` の frame 数を数える。旧 log で `roi` が無い場合は `not_available` にする。
- [ ] 追加 metrics は `calculateMotionMetricSummary()`、`compareMotionMetricSummaries()`、`parseMotionMetricBaseline()` の missing-key 補完、`motionDebugViewerModel` の metrics layer で既存 key と同じように扱われる。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionMetrics.test.ts` を更新し、over_budget / warn の区別、dropped frame 二重計上回避、旧 log not_available、policy stage count、ROI pause count、baseline comparison を検証する。
- [ ] `sincromisor-frontend/src/character/motionEvaluation/__tests__/motionMetricBaselineSchema.test.ts` を更新し、古い baseline に追加 5 key が無い場合に `not_available` + warning severity で補完されることを検証する。
- [ ] `sincromisor-frontend/src/pages/motionDebug/__tests__/motionDebugViewerModel.test.ts` を更新し、metrics layer に追加 5 key と threshold / severity / unavailableReason が表示用 JSON に出ることを検証する。
- [ ] `documents/design/frontend/character/motion.md` に Phase 10 metrics key、計算入力、旧 log の `not_available` 方針、baseline parser の補完方針を同期する。
- [ ] `documents/design/frontend/character/tracking.md` に stats 保存側の field と metrics 側の参照 boundary を同期する。

## 設計判断（着手前に確定済み）

- metrics key は `MotionMetricKey` の fixed union に追加する。外部 JSON で任意 key を許す案は、baseline comparison と viewer 表示の検出可能性が落ちるため採用しない。
- `warn` budget は regression count に含めず、`over_budget` だけを `trackerBudgetOverrunFrameCount` に数える。warn を含めると profile 調整中の一時的な余裕不足が失敗扱いになりやすく、Phase 10 の「段階的劣化」判定と混ざるため。
- dropped frame は `timestamp.droppedPresentedFrames` と tracker stats の `droppedFrames` の大きい方を frame ごとに採用する。source が異なるため単純加算すると同じ欠落を二重計上する可能性がある。
- `degradationStageFrameCount` は旧 log 互換のため `budget.degradation.state` も読むが、`degradationRecoveryFrameCount` は新 `degradationPolicy.recovering` のみを正本にする。旧 log から recovery を推測しない。
- `roiPausedFrameCount` は ROI pause だけを数え、Hand snapshot の `lost` や `pose_stale_for_roi` は数えない。観測欠損と intentional degradation を分けるため。
- 外部境界は motion-debug NDJSON replay input だけである。unknown / invalid optional field は summary 全体を失敗させず、該当 metric を `not_available` にする。

## スコープ境界

- 本タスクでやること:
    - Phase 10 degradation / performance metrics key 追加。
    - metric 計算、threshold、comparison、baseline parser 補完。
    - motion-debug metrics layer の表示モデル更新。
    - tracking / motion 設計文書の同期。
- 本タスクでやらないこと:
    - runtime degradation policy の実装や cadence 変更。
    - fixed motion fixture の実行 harness / CI 化。
    - subjective QA form。
    - new log schema major version 変更。
- 依存タスクとの境界:
    - `task-260627234128-character-animation-3-0-phase-10-ordered-degradation-policy` は `frame.metrics.tracker.degradationPolicy` を保存する。本タスクは保存済み stats を読み、metrics に変換する。
    - `task-260627234129-character-animation-3-0-phase-10-fixed-motion-qa-regression-` は、本タスクの metrics を使って fixed motion QA / regression harness を作る。

## 実装方針（既存コード整合: file:line）

- `MotionMetricKey` は現在 Phase 9 までの fixed union として定義されている（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:34`）。ここへ additive に 5 key を追加する。
- `MOTION_METRIC_KEYS` は fixed order の配列であり、summary / comparison / baseline parser が参照している（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:103`）。追加 key は末尾に入れる。
- default thresholds は `DEFAULT_MOTION_METRIC_THRESHOLDS` に集約されている（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:128`）。ここに Phase 10 thresholds を追加する。
- `parseMetrics()` は `frame.metrics.tracker.workerRoundTripMs` だけを narrow している（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:268`、`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:316`）。本タスクでは budget / roi / degradationPolicy を読む schema を追加する。
- `calculateAddedLatencyMs()` は tracker metrics を読む既存例である（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:710`）。追加 metrics も同じ `NumericMetricComputation` pattern で実装する。
- `compareMotionMetricSummaries()` は key ごとに明示的に comparison を返している（`sincromisor-frontend/src/character/motionEvaluation/motionMetrics.ts:1545`）。追加 5 key を忘れずに加える。
- baseline parser は missing metric key を `not_available` として補完する（`sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts:226`、`sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts:256`）。追加 key もこの補完対象にする。
- motion-debug replay metrics は loaded recording から `calculateMotionMetricSummary()` を呼んでいる（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:461`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:469`）。API shape は変えない。
- recording は tracker stats と camera quality を `frame.metrics` に保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:223`）。本タスクでは保存側 schema major version は変えず、metrics 側 parser を広げる。

## テスト

- `cd sincromisor-frontend && npm run test -- motionMetrics`
- `cd sincromisor-frontend && npm run test -- motionMetricBaselineSchema`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer-visible な replay metrics / baseline schema の fixed key が増えるため、`documents/design/frontend/character/motion.md` に Phase 10 metrics key と閾値、旧 baseline 補完方針を同期し、`documents/design/frontend/character/tracking.md` に保存側 stats boundary を同期する。
