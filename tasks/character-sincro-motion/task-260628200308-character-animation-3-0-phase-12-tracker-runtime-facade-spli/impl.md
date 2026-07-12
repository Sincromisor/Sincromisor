# Implementation Log: task-260628200308-character-animation-3-0-phase-12-tracker-runtime-facade-spli

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- review.md の申し送りどおり、`SincroTrackerWorkerStats` / `budget` / `degradationPolicy` / `roi` / fallback stats の shape は変えず、既存の stats 合成順序を `trackerRuntimeStats.ts` に移した。
- `ignorePerformanceFallback` は degradation policy 側の既存意味を維持し、face-only / comfortable-idle だけを抑制する挙動を変えていない。`trackerRuntimeDegradationPolicy` test で確認した。
- Worker detect / transfer failure は停止ではなく main-thread fallback へ入る既存判断を維持し、`trackerRuntimeWorkerPipeline.ts` に理由コメントを置いた。
- Pose が stale な場合に ROI を作らない判断は `trackerRuntimeRoiSnapshot.ts` に分離し、Pose stale for ROI の理由コメントを置いた。
- ordered degradation policy は「policy が決定、runtime application が state / cadence へ反映」という境界にし、`trackerRuntimeDegradationApplication.ts` に理由コメントを置いた。
- `trackerRuntime.ts` は 977 行から 541 行まで縮小したが、public facade と lifecycle callback adapter が残るため 300 行は超える。review.md の条件に従い、同ファイルに `// reason: structure-threshold-exception ...` を明記した。追加した production module はすべて 300 行未満。
- `documents/design/frontend/character/tracking.md` に分割後の内部 module 境界を同期した。公開 WebRTC / backend 契約の変更はない。

### structure guard 出力の切り分け

`npm run tasks:check:frontend-structure` は exit code 1。出力では本タスク変更ファイル `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts` が 541 行で warning 扱いとなり、`structure-threshold-exception` により accepted。新規 module は 300 行未満で failure なし。

pre-existing branch-wide strict failure path:

- `sincromisor-frontend/src/character/canonical/canonicalTorsoFrameEstimator.ts` 306
- `sincromisor-frontend/src/character/vrmPose/vrmPoseComposer.ts` 306
- `sincromisor-frontend/src/character/canonical/canonicalUpperBodyState.ts` 308
- `sincromisor-frontend/src/character/motionPostProcessing/motionPostProcessingState.ts` 309
- `sincromisor-frontend/src/character/canonical/canonicalArmFeatureExtractor.ts` 312
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase9Snapshot.ts` 326
- `sincromisor-frontend/src/pages/motionDebug/types.ts` 328
- `sincromisor-frontend/src/character/motionEvaluation/motionMetricBaselineSchema.ts` 332
- `sincromisor-frontend/src/features/debug/model/debugConsoleManager.ts` 333
- `sincromisor-frontend/src/character/temporal/temporalUpperBodyState.ts` 346
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugRecorder.ts` 350
- `sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts` 367
- `sincromisor-frontend/src/features/gaze/handTracking/sincroHandTracker.ts` 378
- `sincromisor-frontend/src/character/motionPostProcessing/motionSequenceWindow.ts` 386
- `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeDegradationPolicy.ts` 387
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase6Snapshot.ts` 410
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts` 423
- `sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts` 424
- `sincromisor-frontend/src/character/motionPostProcessing/motionOptimizationCandidateReport.ts` 433
- `sincromisor-frontend/src/character/motionEvaluation/motionDebugPhase7Snapshot.ts` 440
- `sincromisor-frontend/src/character/reliability/reliabilityMap.ts` 469
- `sincromisor-frontend/src/character/ik/sincroArmIkSolver.ts` 504
- `sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts` 581
- `sincromisor-frontend/src/pages/motionDebug/motionDebugViewerModel.ts` 586
- `sincromisor-frontend/src/features/gaze/handTracking/sincroHandTrackerHelpers.ts` 793
- `sincromisor-frontend/src/character/avatarProfile/avatarMotionProfile.ts` 877
- `sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts` 1163

### 検証結果

- `cd sincromisor-frontend && npm run test -- trackerRuntime`: PASS、7 files / 38 tests。
- `cd sincromisor-frontend && npm run test -- trackerRuntimeCadence`: PASS、1 file / 4 tests。
- `cd sincromisor-frontend && npm run test -- trackerRuntimeDegradationPolicy`: PASS、1 file / 7 tests。
- `cd sincromisor-frontend && npm run test -- trackerRuntimeRoiBudget`: PASS、1 file / 5 tests。
- `cd sincromisor-frontend && npm run build`: PASS。
- `cd sincromisor-frontend && npm run check`: PASS。
- `npm run tasks:check:frontend-structure`: exit code 1。上記のとおり本タスク変更ファイルに failure はなく、pre-existing branch-wide strict failure のみ。
- `npm run tasks:check`: PASS。初回は root `node_modules/yaml` が無く失敗したため、worktree 内で `npm install --ignore-scripts --no-audit` により root dependency を復元して再実行した。
- `npm run gate`: PASS。コミット後の clean HEAD `709f0dc14704e58486623d2e1ac2087f3bd817b0` で lint / build / test すべて PASS。gate の test は `cd sincromisor-frontend && npm run test` を含み、51 files / 405 tests。

### コミット

- `709f0dc14704e58486623d2e1ac2087f3bd817b0` `refactor(character): split tracker runtime facade`

### 残リスク

- `trackerRuntime.ts` は facade 化後も lifecycle callback adapter を残すため 541 行で、例外コメント付き。追加 module は 300 行未満に収めた。
- `npm run tasks:check:frontend-structure` の非 0 は既存 branch-wide strict failure によるもので、本タスク範囲外。
