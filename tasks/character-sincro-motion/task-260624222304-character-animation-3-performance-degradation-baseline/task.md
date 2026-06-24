# character animation 3.0 performance degradation baseline

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 3 は、`detectForVideo()` 系の同期推論を Worker 分離標準にし、main thread fallback は低 fps / debug 用に限定し、performance budget と degradation state を debug に保存することを求めている。

現行 runtime には Worker 経路、main-thread fallback、Pose 推論遅延による face-only 降格があるが、debug snapshot と motion log からは「Worker transfer が重いのか」「Worker 内推論が重いのか」「main-thread fallback に入ったのか」「どの budget を超えたのか」を一意に追いにくい。

このタスクでは Phase 3 の performance baseline と degradation state を構造化し、motion-debug / Debug Console / recording で確認できるようにする。実際の ROI、Hand / Face / Gesture の低 fps orchestration、ReliabilityMap への weight 反映は後続 Phase の責務として残す。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePerformanceBudget.ts` を追加し、`createTrackerPerformanceBudgetReport(input)` が `TrackerPerformanceBudgetReport` を返す。
- [ ] `TrackerPerformanceBudgetReport` は `schemaVersion: "sincro.tracker-performance-budget.v1"`、`target`、`observed`、`budgetStatus`、`degradation`、`reasonCodes` を持つ。全 number は finite にし、欠損値は `undefined` で表す。
- [ ] `SincroTrackerWorkerStats` に `workerTimeMs`、`mainThreadDetectTimeMs`、`effectiveFaceFps`、`effectivePoseFps`、`budget?: TrackerPerformanceBudgetReport` を追加する。既存 `mode`、`status`、`transferTimeMs`、`workerRoundTripMs`、`loadTimeMs`、`droppedFrames`、`fallbackReason` は削除 / rename しない。
- [ ] Worker result message の `workerTimeMs` を main-thread 側 stats に反映し、`workerRoundTripMs`、`transferTimeMs`、`workerTimeMs` を別 field として debug できるようにする。
- [ ] main-thread fallback 経路では `mainThreadDetectTimeMs` を記録し、`mode: "main-thread"` の stats に `budget` を含める。Worker unavailable / failed の fallback reason は従来どおり残す。
- [ ] `TrackerRuntimePosePerformanceGate` は降格理由の string だけでなく、`TrackerRuntimeDegradationState` を返す。state は `"full"`、`"main-thread-low-fps"`、`"pose-reduced-fps"`、`"face-only"`、`"fallback"` のいずれかに固定する。
- [ ] Worker 経路を標準とし、Worker が使える場合は従来どおり Worker を優先する。Worker が使えない / 初期化失敗した場合の main-thread fallback は effective target を face `<= 8fps`、pose `<= 4fps` に clamp し、`degradation.state = "main-thread-low-fps"` として記録する。`ignorePerformanceFallback: true` の motion-debug でもこの state は記録し、face-only 降格だけを抑制する。
- [ ] `budgetStatus` は `"ok" | "warn" | "over_budget"` に固定する。基準は `target.frameBudgetMs = 1000 / targetInferenceFps`、`target.poseBudgetMs = 1000 / targetPoseInferenceFps`、`workerRoundTripMs > frameBudgetMs * 0.9` を warn、`> frameBudgetMs * 1.25` を over_budget、`pose.inferenceTimeMs > poseBudgetMs * 0.9` を warn、`> poseBudgetMs * 1.25` を over_budget とする。
- [ ] dropped frame、worker pending detect、Worker failure、pose repeated failures、pose inference too slow、main-thread fallback を `reasonCodes` に保存し、Debug Console と motion-debug camera / metrics layer から確認できる。
- [ ] `MotionDebugSnapshot.tracker` と Debug Console の `sincroMotion.tracker` に `budget` と `degradation` が載る。既存 snapshot field 名は変更しない。
- [ ] motion debug recording の `frame.metrics.tracker` に拡張 stats が保存され、`parseMotionDebugLogLines()` は旧 stats だけの log と新 `budget` 付き log の双方を受け入れる。
- [ ] motion metrics に `trackerBudgetOverrunCount` または同等の metric を追加しない。Phase 1 metrics key を増やす変更は別タスクに残し、本タスクでは既存 metrics layer に `frame.metrics.tracker.budget` が表示されれば完了とする。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntimePerformanceBudget.test.ts` を追加し、ok / warn / over_budget、main-thread-low-fps、face-only、fallback reason code、unknown optional field の境界を検証する。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/trackerRuntimePosePerformanceGate.test.ts` または既存相当 test を追加 / 更新し、`ignorePerformanceFallback` 時も degradation state は残り、face-only 降格は抑制されることを検証する。
- [ ] `motionDebugViewerModel` または Debug Console snapshot の test を更新し、budget 付き tracker stats が camera / metrics layer で JSON として確認できることを検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に performance budget report、degradation state、main-thread fallback の低 fps 制限、metrics key を増やさない判断を同期する。

## 設計判断（着手前に確定済み）

- performance budget の pure function は `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePerformanceBudget.ts` に置く。`TrackerRuntime` の private method へ閉じる案は、threshold と degradation reason の単体テストがしづらくなるため採用しない。
- `TrackerRuntimePosePerformanceGate` は pose 降格の判定を残すが、budget report 生成は持たない。gate は runtime state transition、budget report は debug / log 用の説明値として分ける。
- 最小 schema は次に固定する。

```ts
export type TrackerRuntimeDegradationState =
    | "full"
    | "main-thread-low-fps"
    | "pose-reduced-fps"
    | "face-only"
    | "fallback";

export type TrackerPerformanceReasonCode =
    | "worker_round_trip_warn"
    | "worker_round_trip_over_budget"
    | "worker_transfer_warn"
    | "worker_pending_frame_dropped"
    | "pose_inference_warn"
    | "pose_inference_over_budget"
    | "pose_detection_failed_repeatedly"
    | "worker_unavailable"
    | "worker_failed"
    | "main_thread_fallback";

export type TrackerPerformanceBudgetReport = {
    schemaVersion: "sincro.tracker-performance-budget.v1";
    target: {
        faceTargetFps: number;
        poseTargetFps: number;
        frameBudgetMs: number;
        poseBudgetMs: number;
    };
    observed: {
        clockSource?: string;
        transferTimeMs?: number;
        workerRoundTripMs?: number;
        workerTimeMs?: number;
        mainThreadDetectTimeMs?: number;
        poseInferenceTimeMs?: number;
        droppedFrames: number;
        effectiveFaceFps?: number;
        effectivePoseFps?: number;
    };
    budgetStatus: "ok" | "warn" | "over_budget";
    degradation: {
        state: TrackerRuntimeDegradationState;
        reason?: TrackerPerformanceReasonCode;
        sinceMediaTimeMs?: number;
    };
    reasonCodes: TrackerPerformanceReasonCode[];
};
```

- `workerTimeMs` は Worker 内の Face / Pose detect 合計時間、`workerRoundTripMs` は main-thread から postMessage して result を受けるまでの時間、`transferTimeMs` は `createImageBitmap(video)` の時間として分ける。これらを合算した別 field は作らない。
- main-thread fallback は削除しない。ただし Phase 3 の方針に合わせ、本番相当の通常経路では Worker 優先、fallback 時は低 fps clamp と explicit degradation state を必須にする。
- `pose-reduced-fps` は本タスクでは state enum と budget report に用意するが、自動的な pose fps 段階下げは実装しない。実際の段階的 degradation policy は後続 Phase E で扱う。
- metrics key は増やさない。Phase 1 の baseline schema は固定 key 前提なので、本タスクで `MotionMetricKey` を増やすと baseline fixture 更新まで巻き込むため採用しない。
- 外部境界は Worker message protocol と browser performance clock のみである。Worker message に `workerTimeMs` が無い旧状態は `undefined` として扱い、stats / log parse を失敗させない。

## スコープ境界

- 本タスクでやること:
    - Tracker performance budget report の型と pure function。
    - Worker / main-thread stats の breakdown 拡張。
    - degradation state の debug snapshot / motion log 保存。
    - main-thread fallback の effective fps clamp と state 表示。
    - tracking / motion 設計文書の同期。
- 本タスクでやらないこと:
    - Hand / Face / Gesture の ROI orchestration。
    - pose fps を複数段階で自動調整する degradation policy。
    - motion metrics baseline key の追加。
    - Worker 必須化による main-thread fallback 削除。
    - MediaPipe model / delegate の変更。
    - UI の大規模 redesign。
- 依存タスクとの境界:
    - `task-260624222255-character-animation-3-video-frame-clock` は `clockSource` と video-frame 基準 timestamp を提供する。本タスクはその timing を budget report の observed に載せる。
    - `task-260624222300-character-animation-3-camera-quality-score` は camera quality と guide を提供する。本タスクは performance budget を扱い、camera framing / guide 文言は変更しない。

## 実装方針（既存コード整合: file:line）

- Worker stats は現在 `mode`、`status`、`transferTimeMs`、`workerRoundTripMs`、`loadTimeMs`、`droppedFrames`、`fallbackReason` を持つ（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:14`）。本タスクでは additive に field を増やす。
- Worker result message はすでに `workerTimeMs` を返している（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:60`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:65`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:123`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:128`）。main-thread client は現在 stats に反映していないため、ここを接続する。
- Worker client は pending detect 時に droppedFrames を増やし、result 受信時に `workerRoundTripMs` を記録している（`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerClient.ts:84`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerClient.ts:194`、`sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerClient.ts:197`）。本タスクでは pending / round trip / worker time を budget reason に反映する。
- `TrackerRuntime.predictWithWorker()` は `createImageBitmap` transfer time と Worker detect を測って callbacks へ stats を渡している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:187`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:197`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:200`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:201`）。ここで latest budget report を作る。
- main-thread 経路は `faceTracker.detect()` と `runPoseInference()` を同期実行し、その後 schedule する（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:174`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:177`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:184`）。本タスクでは main-thread detect duration と effective fps clamp を記録する。
- `TrackerRuntimePosePerformanceGate` は repeated failure と pose inference too slow を string reason として返す（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePosePerformanceGate.ts:31`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimePosePerformanceGate.ts:53`）。本タスクでは reason と degradation state を持つ structured result に変える。
- fallback stats helper は currently `mode: "fallback"` の最小 stats を publish している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFallbackStats.ts:4`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFallbackStats.ts:9`）。本タスクでは budget / degradation を含める。
- Debug Console snapshot は `sincroMotion.tracker` を `SincroTrackerWorkerStats` として保持している（`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:60`、`sincromisor-frontend/src/features/debug/model/debugConsoleSnapshot.ts:63`、`sincromisor-frontend/src/features/debug/model/debugConsoleSincroMotionControls.ts:51`）。型拡張に追従すれば既存 API で観測できる。
- motion-debug recording は `frame.metrics.tracker` に `getTrackerStats()` を保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:132`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:134`）。本タスクでは同じ field に拡張 stats が入る。
- `documents/design/frontend/character/tracking.md` は Worker / main-thread fallback と pose performance gate を説明している（`documents/design/frontend/character/tracking.md:31`、`documents/design/frontend/character/tracking.md:125`、`documents/design/frontend/character/tracking.md:129`）。budget report と low-fps fallback 方針を同期する。
- `documents/design/frontend/character/motion.md` は motion log metrics と `frame.metrics.tracker` を説明している（`documents/design/frontend/character/motion.md:135`、`documents/design/frontend/character/motion.md:138`）。budget 保存と metrics key 非追加を同期する。

## テスト

- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceBudget`
- `cd sincromisor-frontend && npm run test -- trackerRuntimePosePerformanceGate`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- 手動または Playwright で `motion-debug` を開き、`getSnapshot().tracker.budget.schemaVersion === "sincro.tracker-performance-budget.v1"`、Worker 経路の `workerTimeMs`、fallback 時の `degradation.state` を確認する。Worker fallback を実機で再現できない場合は unit test で代替し、未実行理由を `impl.md` に残す。
- `npm run tasks:check`

## ドキュメント同期の要否

要。公開通信契約は変えないが、developer 向け Debug Console / motion-debug snapshot / motion log の保存内容と runtime degradation の公開挙動が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に performance budget report、degradation state、main-thread fallback 低 fps 制限、metrics key を増やさない判断を同期する。
