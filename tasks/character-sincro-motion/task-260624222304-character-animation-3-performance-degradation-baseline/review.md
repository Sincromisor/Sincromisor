# Review: task-260624222304-character-animation-3-performance-degradation-baseline

## 判定

APPROVED

Critical / High の blocking 指摘はない。公開通信契約は変えず、Debug Console / motion-debug / motion log という developer 向け公開挙動の変更は `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` への同期が受け入れ条件に明記されているため、実装へ進めてよい。

## 指摘事項

- [Medium] `TrackerPerformanceReasonCode` に `worker_transfer_warn` がある一方、`budgetStatus` の閾値は `workerRoundTripMs` と `pose.inferenceTimeMs` だけが定義されている。`transferTimeMs` は observed 値として確認できるため blocking ではないが、実装時は `worker_transfer_warn` を未使用にするのか、round trip とは別の warn 条件を置くのかを `impl.md` に明記すること。
- [Medium] 既存 gate の理由文字列 `pose_inference_too_slow` は、task.md の reason code enum には同名で含まれていない。`pose_inference_warn` / `pose_inference_over_budget` へ写像するのか、既存 `fallbackReason` には従来文字列を残して `reasonCodes` だけ enum 化するのかを実装時に一貫させること。受け入れ条件の「既存 field 名を変更しない」「fallback reason は従来どおり残す」を守れば task.md の欠陥ではない。
- [Low] `motion-debug camera / metrics layer` で確認できる、という記述は既存 `MotionDebugViewerModel` の layer 構造では `metrics` が `MotionMetricSummary` 表示で、live tracker stats は `MotionDebugSnapshot.tracker` 側にある。Debug Console snapshot での確認も受け入れ条件に含まれているため blocking ではないが、どの表示面を正にしたかを test 名と `impl.md` で明確にすること。

## 実装者への申し送り

- 既存前提は概ね現行コードと整合している。`SincroTrackerWorkerStats` は `sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTrackerWorkerTypes.ts:14` で既存 field を持ち、Worker result の `workerTimeMs` は同ファイル `:60` と `sincroTracker.worker.ts:123` に存在する。`sincroTrackerWorkerClient.ts:194` では現在 `workerRoundTripMs` のみ stats へ反映しているため、ここに `workerTimeMs` を additive に接続する。
- main-thread fallback は `trackerRuntime.ts:241` と `trackerRuntimeFallbackStats.ts:4` が境界になる。fallback stats の既存 `mode/status/fallbackReason` を壊さず、低 fps clamp と `budget` / `degradation` を載せること。
- Debug Console は `debugConsoleSnapshot.ts:60` と `debugConsoleSincroMotionControls.ts:51`、motion-debug recording は `motionDebugRecordingController.ts:132`、motion log schema は `motionDebugLogSchema.ts:95` が主な確認点。旧 log と新 log の双方を `parseMotionDebugLogLines()` が受け入れることを test で固定する。
- document sync は必須。特に `tracking.md` の Worker / fallback / pose performance gate 説明と、`motion.md` の `frame.metrics.tracker` / metrics fixed key 方針を同時に更新する。
- 確認観点は task.md のテスト列挙どおりでよい。追加で、Worker が返す `workerTimeMs`、main-thread fallback の `mainThreadDetectTimeMs`、`ignorePerformanceFallback: true` 時の `degradation.state` 維持、旧 stats only log の parse 互換を重点的に見ること。
