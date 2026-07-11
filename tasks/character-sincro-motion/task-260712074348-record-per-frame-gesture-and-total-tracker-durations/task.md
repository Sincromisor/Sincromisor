# Record per-frame gesture and total tracker durations

## 背景 / 目的

`task-260712044932-capture-gesture-camera-performance-baseline` は実カメラ収録から
`gestureInferenceDurationMsP95` と `totalTrackerDurationMsP95` を再計算する必要があるが、現行
motion-debug frame は gesture 個別推論時間と tracker frame 合計時間を保存していない。計測 field の追加と
baseline 収録を分離し、収録 artifact だけから性能 gate を再現可能にする。

## 完了条件（受け入れ条件）

- [ ] `SincroTrackerWorkerStats` に optional finite non-negative の
  `gestureInferenceTimeMs` を追加する。total は新fieldを増やさず、Worker modeでは既存 `workerTimeMs`、
  main-thread modeでは既存 `mainThreadDetectTimeMs` を使う。gesture pass を実行しなかった frame は
  `gestureInferenceTimeMs` を省略し、実行して結果が lost の frame も実測値を保持する。
- [ ] main-thread runtime は gesture inference result の `inferenceTimeMs` を同じ frame の stats へ渡す。
  `mainThreadDetectTimeMs` は frame callback 内の tracker detect 開始から全 optional pass と stats 合成直前までの
  elapsed time とし、`performance.now()` の同一 clock で一度だけ計算する。
- [ ] Worker runtime は result message に gesture 個別推論時間を optional plain number として含め、既存
  `workerTimeMs` を total tracker time として再利用する。計測開始は現行どおり `detect()` entry（`initialize()`前）、
  終了は result組み立て直前とし、初回initialize時間も含める。main thread の transfer/round-trip時間は加算しない。
  initialize済み/未済みの両経路でこの開始点を focused test に固定する。main-thread fallback と worker
  の値が同じ「tracker 内で当該 frame を処理した時間」契約になること。
- [ ] motion-debug recording の `frame.metrics.tracker` に `gestureInferenceTimeMs` と既存total fieldを保存し、
  v1 schemaVersionを維持する。旧logのfield欠損はparse可能にする。新規
  `motionTrackerPerformanceSamples.ts` の公開parserは `{samples,warnings}` を返し、warningは
  `{code:"invalid_tracker_duration";frameIndex:number;fieldPath:"metrics.tracker.gestureInferenceTimeMs"|"metrics.tracker.workerTimeMs"|"metrics.tracker.mainThreadDetectTimeMs"}`
  とする。不正な非有限値・負値は該当fieldだけ除外し、warningをcallerへ返してlog全体をrejectしない。
- [ ] baseline専用 `calculateTrackerPerformanceDurationSummary()` を同moduleに追加し、既存
  `MotionMetricSummary` / `MotionMetricKey` / threshold / comparison / baseline schemaは変更しない。有限値だけを
  母集団とするnearest-rank p95として `gestureInferenceDurationMsP95` / `totalTrackerDurationMsP95` を返す。
  total sampleは `tracker.mode` により worker=`workerTimeMs`、main-thread=`mainThreadDetectTimeMs` を選ぶ。
  サンプル0件は `null`、1件はその値、
  複数件は昇順の `ceil(0.95*n)-1` index とする。gesture skipped frame は gesture 側の分母に含めない。
- [ ] main-thread の gesture executed/skipped/lost、Worker result、旧log欠損、invalid field、p95 の0/1/複数sampleを
  focused tests で固定する。`npm run gate` を通す。
- [ ] `documents/design/frontend/character/tracking.md` と `motion.md` に field の clock、包含範囲、欠損条件、
  p95 の母集団と旧log互換を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録し、Worker message boundary、main-thread duration owner、
  recording schema/parser、p95集計を対象にする。

## 設計判断（着手前に確定済み）

- field は新しい telemetry stream を作らず、既存 `SincroTrackerWorkerStats` と
  `frame.metrics.tracker` に載せる。totalは既存 `workerTimeMs` / `mainThreadDetectTimeMs` を再利用し、新しい
  `totalTrackerTimeMs` は追加しない。既存fieldと同じ意味の二重化を避けるため。motion-debug recording がbaselineの唯一の証拠であり、
 別streamではframe対応とscrub契約が分裂するため。
- total は wall-clock の callback間隔や render時間ではなく、tracker 内の当該frame処理区間だけを測る。
  Workerは既存 `workerTimeMs` の開始点（initialize前）を互換維持し、main-threadはdetect callback内時間とする。
  transport latencyを混ぜない。Worker初回だけinitialize costを含む現行契約は変えず、集計側で除外もしない。
- schemaVersion は v1のままにする。既存 `metrics` slot はoptional unknownで、追加fieldもoptionalなため破壊的変更ではない。
- p95は nearest-rank に固定し、線形補間は採用しない。baseline gateの再計算をJSONと単純sortだけで一致させるため。
- performance p95は既存QA metric setへ追加せずbaseline専用summaryにする。既存threshold/comparison schemaへ
  一時的な実機budgetを混ぜず、後続baseline taskの `metrics.json` 生成だけに使うため。

## スコープ境界

- 本タスク: per-frame duration 計測、recording保存、parser/summary、tests、設計文書。
- 依存先 baseline タスク: 実カメラ収録、on/off比較、閾値判定、artifact作成。本タスクでは収録しない。
- スコープ外: performance tuning、cadence変更、budget閾値変更、公開UI、backend/WebRTC。

## 実装方針（既存コード整合: file:line）

- `sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:42-60` が stats contract、
  `:104-114` が Worker result messageを所有する。既存 `workerTimeMs` は維持し、gesture個別時間だけ追加する。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:181-230` は
  `detect()` entry（initialize前）からresult組み立て直前までを既に `workerTimeMs` として測る正本である。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeMainThreadPipeline.ts:67-117` は detect 開始、
  optional gesture pass、stats publish を同じ callbackで所有するため total duration の正本にできる。
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeStats.ts:51-88` が main-thread stats 合成境界で、
  gesture/total field の受け渡し先になる。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:224-250` は
  `metrics.tracker` を各frameへ保存済みである。
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:115-132` は metrics slot を optional
  unknown として保持し、layer parser側で旧log互換を維持する契約である。
- `sincromisor-frontend/src/pages/motionDebug/motionDebugMetricsRuntime.ts:45-62` が recording summary のUI/API入口である。
- 新規 `sincromisor-frontend/src/character/motionEvaluation/motionTrackerPerformanceSamples.ts` が
  field単位parser warningとbaseline専用p95 summaryを所有し、viewer/runtime callerが warningを検証可能に受け取る。

## テスト

- tracker main-thread/Worker stats focused tests、motion-debug parser/metrics testsを実行する。
- `npm run gate` で lint/format、frontend build/type、全testを通す。
- fixtureで raw frame valuesから指定nearest-rank p95を独立再計算し、summary fieldと一致すること、および
  invalid field warningのcode/frameIndex/fieldPathを確認する。

## ドキュメント同期の要否

要。developer-facing recording/performance contract が変わるため
`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期する。
backend、WebRTC、公開ユーザーUIの契約は変更しない。

## Comment audit / 評価条件

`impl.md` に `path | symbol or decision | kind | current comment | decision | required maintenance knowledge | action | reviewer note`
で全変更symbol/decisionを記録する。最低対象は `SincroTrackerWorkerResultMessage`、main-thread/Worker duration owner、
`SincroTrackerWorkerStats`、motion-debug layer parser、p95 aggregator。clock、包含/除外範囲、skipped/lost/invalid/旧log条件を
説明しないcomment、型の逐語説明、auditと実装の不一致があれば評価FAILとする。
