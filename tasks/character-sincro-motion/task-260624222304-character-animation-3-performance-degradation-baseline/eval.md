# Evaluation: task-260624222304-character-animation-3-performance-degradation-baseline

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `trackerRuntimePerformanceBudget.ts` が追加され、`createTrackerPerformanceBudgetReport(input)` が `TrackerPerformanceBudgetReport` を返す。根拠: `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePerformanceBudget.ts`
- [✓] report schema は `schemaVersion: "sincro.tracker-performance-budget.v1"`、`target`、`observed`、`budgetStatus`、`degradation`、`reasonCodes` を持つ。number は finite に正規化され、non-finite optional observation は `undefined` 扱いになる。根拠: `trackerRuntimePerformanceBudget.test.ts` の ok / unknown optional field case。
- [✓] `SincroTrackerWorkerStats` は既存 `mode`、`status`、`transferTimeMs`、`workerRoundTripMs`、`loadTimeMs`、`droppedFrames`、`fallbackReason` を維持し、`workerTimeMs`、`mainThreadDetectTimeMs`、`effectiveFaceFps`、`effectivePoseFps`、`budget?` を additive に追加している。根拠: `sincroTrackerWorkerTypes.ts`
- [✓] Worker result message の `workerTimeMs` は main-thread 側 stats に反映され、`workerRoundTripMs` / `transferTimeMs` / `workerTimeMs` は別 field として保持される。根拠: `sincroTrackerWorkerClient.ts`、`trackerRuntime.ts`
- [✓] main-thread fallback 経路は `mainThreadDetectTimeMs` を記録し、`mode: "main-thread"` stats に `budget` を含める。Worker fallback reason も既存 `fallbackReason` に残る。根拠: `trackerRuntime.ts`、`trackerRuntimeFallbackStats.ts`
- [✓] `TrackerRuntimePosePerformanceGate` は string reason だけでなく structured result を返し、degradation state enum は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` に固定されている。根拠: `trackerRuntimePosePerformanceGate.ts`、`trackerRuntimePerformanceBudget.ts`
- [✓] Worker available 時は Worker 経路を優先し、fallback 時は face `<= 8fps` / pose `<= 4fps` に clamp して `main-thread-low-fps` を記録する。`ignorePerformanceFallback: true` では slow pose の face-only 降格だけを抑制し、degradation state / reason は残る。根拠: `trackerRuntime.ts`、`trackerRuntimePosePerformanceGate.test.ts`
- [✓] `budgetStatus` は `"ok" | "warn" | "over_budget"` で、worker round trip と pose inference の `0.9x` warn / `1.25x` over budget 閾値に従う。根拠: `trackerRuntimePerformanceBudget.test.ts`
- [✓] dropped frame / worker pending detect / Worker failure / pose repeated failures / pose inference too slow / main-thread fallback は `reasonCodes` に保存される。`pose_inference_too_slow` は旧 `fallbackReason` に残し、budget reason code へ写像している。根拠: `trackerRuntimePerformanceBudget.ts`、`trackerRuntimePosePerformanceGate.ts`
- [✓] `MotionDebugSnapshot.tracker` と Debug Console の `sincroMotion.tracker` は `SincroTrackerWorkerStats` を参照するため、budget / degradation 付き stats が載る。既存 snapshot field 名は変更されていない。根拠: `debugConsoleSnapshot.ts`、`motionDebug/types.ts`
- [✓] motion debug recording は `frame.metrics.tracker` に拡張 stats を保存する既存経路を維持し、`parseMotionDebugLogLines()` は旧 stats only log と新 budget 付き log の双方を受け入れる。根拠: `motionDebugRecordingController.ts`、`motionDebugLogSchema.test.ts`
- [✓] motion metrics key は増えていない。`MotionMetricKey` / `MOTION_METRIC_KEYS` は既存 8 key のまま。根拠: `motionMetrics.ts`
- [✓] `trackerRuntimePerformanceBudget.test.ts` は ok / warn / over_budget、main-thread-low-fps、face-only、fallback reason code、unknown optional field を検証している。
- [✓] `trackerRuntimePosePerformanceGate.test.ts` は `ignorePerformanceFallback` 時も degradation state を返し、face-only 降格が抑制されることを検証している。
- [✓] `motionDebugViewerModel.test.ts` は replay frame の `frame.metrics.tracker.budget` が metrics layer JSON として確認できることを検証している。
- [✓] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` は performance budget report、degradation state、main-thread fallback の低 fps 制限、metrics key を増やさない判断に同期されている。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行 cwd: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-4d562587bc65-wwrOuR`
- 対象 commit: `4d562587bc656f3ac14cfcff98a04bf668b0614a`
- 結果: passed
    - `gate:lint` CACHE HIT / passed
    - `gate:build` CACHE HIT / passed
    - `gate:test` CACHE HIT / passed, `101 passed (101)`
- worktree 状態: gate 実行前後とも `git status --short` は clean。
- カバレッジ評価: 受け入れ条件の主要境界は unit test で固定されている。特に budget 閾値、finite handling、旧 log 互換、viewer metrics layer 表示、`ignorePerformanceFallback` 時の structured degradation が検証済み。実機での Worker fallback 再現は `impl.md` 記載どおり未実行だが、外部依存を避けるべき評価範囲では unit test と gate で十分に代替されている。

## ドキュメント整合性

- 契約 / 公開挙動の変更: あり。developer 向け Debug Console / motion-debug snapshot / motion log に tracker budget / degradation state が追加され、main-thread fallback の effective fps が明文化される。
- 同期状況: 同期済み。`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に report schema、reasonCodes、low-fps fallback、旧 `fallbackReason` 互換、`frame.metrics.tracker.budget`、metrics key 非追加方針が追記されている。
- 生成物 / schema 配布物: 追加の生成物は見当たらない。motion debug log schema は `metrics: unknown` を維持しており、新旧 tracker stats の parse 互換を test で固定している。

## 残課題（FAIL の場合）

- なし。
