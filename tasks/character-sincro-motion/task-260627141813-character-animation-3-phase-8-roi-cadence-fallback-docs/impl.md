# Implementation Log: task-260627141813-character-animation-3-phase-8-roi-cadence-fallback-docs

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断

- review.md は APPROVED。依存成果物として `SincroHandMotionSnapshot`、`TrackerRuntimePoseOptions.hand`、`SincroTrackerWorkerResultMessage.hand`、`SincroTrackerWorkerStats.effectiveHandFps`、`SincroFaceMotionSnapshot.roi/source/warnings` が worktree HEAD に存在することを確認して実装した。
- Face ROI は `TrackerRuntimePoseOptions.faceRoi` の optional option とし、未指定では disabled のままにした。既存 full-frame Face / Pose / Hand cadence の公開 field 名と意味は維持した。
- ROI pause / over-budget は `SincroTrackerWorkerStats.roi` に閉じ、performance budget report の `target` / `observed` shape は変更しない方針にした。budget の `reasonCodes` には ROI reason code だけを追加し、累積値と pause state は `roi` stats を正本にした。
- main-thread fallback clamp は pure policy に分離した。Hand ROI は `<= 2fps`、Face ROI は `<= 3fps`、full-frame Face は `<= 8fps`、Pose は `<= 4fps`。
- `npm run tasks:check` は最初、実装 worktree root に `node_modules/yaml` が無く `ERR_MODULE_NOT_FOUND` で失敗した。worktree 内で `npm install --ignore-scripts --no-audit --no-fund --offline` を実行して root 依存 `yaml` だけを展開し、再実行で PASS した。`node_modules` は gitignore 対象でコミットしない。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` に Face ROI option / cadence、Pose stale skip、ROI pause order、over-budget 閾値、main-thread fallback clamp、ROI stats / reason code、motion-debug observation point を同期した。
- `documents/design/frontend/character/motion.md` に motion-debug metrics layer で `frame.metrics.tracker.roi` を確認する運用と pause 中 snapshot 更新の意味を同期した。
- `documents/design/frontend/character/overview.md` に `frame.metrics.tracker.roi` の debug / replay 用 stats と既存 cadence / budget shape 維持を同期した。

### Verification

- `cd sincromisor-frontend && npm run test -- trackerRuntimeCadence`
- `cd sincromisor-frontend && npm run test -- trackerRuntimeRoiBudget`
- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceBudget`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- trackerRuntimeCadence trackerRuntimeRoiBudget trackerRuntimePerformanceBudget motionDebugViewerModel`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`
- `npm run gate` PASS

### 残リスク

- 実カメラ / 実 MediaPipe Worker のブラウザ手動確認は未実施。今回の確認は unit / build / gate まで。

### Commit

- `1d2bb31b4cab6e42b6f22bb74d0054d8f375a0e4`
- 最終 `npm run gate` は commit `1d2bb31` の clean state で PASS。

## attempt 2

### 判断

- eval.md の FAIL は妥当。attempt 1 では Face ROI due frame で `detectWithRoi()` が full-frame `detect()` を置換しており、Face ROI を補助 pass とする受け入れ条件を満たしていなかった。
- main-thread runtime は full-frame `detect()` を必ず実行し、Face ROI は別 pass として実行して ROI stats に渡す構造に変更した。`onFaceMotion` へ渡す snapshot は full-frame Face を正本にし、ROI pass が得た ROI metadata / warning だけを合成する。
- Worker 経路も full-frame `detect()` と optional Face ROI pass を分離した。Worker result は full-frame Face snapshot を従来の `face` に保持し、ROI stats 用に optional `faceRoi` を返す。
- `SincroFaceTracker` の inference fps clock は full-frame と ROI で分けた。ROI 補助 pass が full-frame Face の推論 fps 観測を短く見せないようにするため。

### ドキュメント同期

- attempt 1 で `documents/design/frontend/character/tracking.md`、`motion.md`、`overview.md` は「Face ROI は optional lower fps pass」「full-frame Face cadence は維持」として同期済み。
- attempt 2 はその文書化済み方針に実装を合わせる修正であり、公開 WebRTC / backend 契約、developer-facing option 名、stats schema、debug metrics の意味は追加変更していないため、追加の設計文書更新は不要と判断した。

### Verification

- `cd sincromisor-frontend && npm run test -- trackerRuntime`
- `cd sincromisor-frontend && npm run test -- trackerRuntime trackerRuntimeCadence trackerRuntimeRoiBudget trackerRuntimePerformanceBudget motionDebugViewerModel`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run gate` PASS
    - `gate:lint` PASS
    - `gate:build` PASS
    - `gate:test` PASS（36 files / 280 tests）

### 残リスク

- 実カメラ / 実 MediaPipe Worker のブラウザ手動確認は未実施。今回の確認は runtime-level unit test、関連 unit test、build、gate まで。

### Commit

- `7be061ada52985f9fe2f856d8fe476ba1d13947a`
- 最終 `npm run gate` は commit `7be061a` の clean state で PASS。
