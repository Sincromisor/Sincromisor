# Connect camera quality to production observe-only reliability

## 背景 / 目的

`documents/research/character_animation/roadmap.md` は 2026-07-05 時点の残差として、`CameraQualityScore` が `motion-debug` recording / reliability には接続済みだが、production observe-only pipeline の reliability 入力には未接続であると整理している（`documents/research/character_animation/roadmap.md:81`、`documents/research/character_animation/roadmap.md:90`、`documents/research/character_animation/roadmap.md:91`）。

現状の `SincroMotionObserveOnlyPipeline` は `createPoseReliabilityMap()` を呼ぶが `cameraQuality` を渡していないため、production `sincro` の `ReliabilityMap.camera.cameraQualityStatus` は実 camera framing / cadence を反映できない。本タスクでは、production callback 内で `CameraQualityScore` を生成し、observe-only reliability へ渡す。

## 完了条件（受け入れ条件）

- [ ] production `sincro` の Pose callback で、`SincroPoseMotionSnapshot`、`TrackerVideoFrameTiming`、scrub 済み `MediaStreamTrack.getSettings()`、`MediaStreamTrack.readyState`、video size から `CameraQualityScore` を生成する。
- [ ] `SincroMotionObserveOnlyPipelineInput` に optional `cameraQuality?: CameraQualityScore` を追加し、`updatePose()` / `updateFace()` / `updateHand()` の downstream 再計算時に最新 score を `createPoseReliabilityMap({ cameraQuality })` へ渡す。
- [ ] score 生成は `pose` snapshot がある frame に限定する。Face-only / Hand-only / source none 相当では score を捏造せず、既存 estimator の `camera_quality_missing` fallback を使う。
- [ ] `CameraQualityScore.track` には `width`、`height`、`frameRate`、`facingMode`、`readyState` だけが入り、raw `deviceId`、`groupId`、`label` は production state / Debug Console / test fixture に保存されない。
- [ ] `CameraQualityScore.overall.status === "bad"` または `overall.score === 0` の frame で、`ReliabilityMap.camera.cameraQualityStatus` と joint / part の `cameraQuality` component が bad / low score になることを unit test で確認する。
- [ ] timing history と pose sample history は production helper 内で bounded に保持し、camera refresh、mode 切替、tracking stop の `resetObserveOnlyPipeline()` 経路で破棄する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期し、production observe-only reliability が `CameraQualityScore` を読むこと、raw camera identifier を保存しないこと、source none では score を作らないことを明記する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも production camera quality helper、`SincroMotionObserveOnlyPipelineInput.cameraQuality`、raw device identifier scrub、bounded history reset、Face-only fallback decision を含める。

## 設計判断（着手前に確定済み）

- production 用 score 生成 helper は `sincromisor-frontend/src/app/controller/sincroCameraQualityRuntime.ts` に置く。`pages/motionDebug/motionDebugCameraRuntime.ts` を production から import する案は、page 専用 lifecycle と app controller lifecycle を混ぜるため採用しない。
- helper の公開 API は `updatePoseQuality(input)`, `getCameraQuality()`, `reset()` に固定する。`updatePoseQuality()` の input は `pose`、`timing`、`video`、`trackSettings`、`trackReadyState` に限定し、DOM video element や MediaStreamTrack instance は保持しない。
- `SincroCharacterMotionEventSinkOptions` には `readTrackSettings: () => MediaTrackSettings | undefined` と `readTrackReadyState: () => MediaStreamTrackState | undefined` を追加する。`SincroMotionObserveOnlyPipeline` へ track object を渡す案は、pipeline を browser API に依存させるため採用しない。
- `createObserveOnlyInput()` は最新 `CameraQualityScore` を optional に載せるだけにする。score の生成・history 更新は Pose callback の直前または直後に一度だけ行い、Face / Hand callback では latest score の参照に留める。
- `createCameraQualityScore()` の `source` は production camera では `"camera"` に固定する。fixture / replay 用の `"fixture"` は motion-debug 側の責務であり、本 task では使わない。

## スコープ境界

- 本タスクでやること: production camera quality score 生成、observe-only input への受け渡し、ReliabilityMap 反映、reset lifecycle、unit test、設計文書同期。
- 本タスクでやらないこと: user-facing camera guide UI、motion-debug camera runtime の refactor、calibration step 判定の変更、IK / VrmPoseComposer weight の直接変更、WebRTC / backend 契約変更。
- 依存タスクとの境界: `task-260624222300-character-animation-3-camera-quality-score` が pure scorer を提供し、`task-260625035438-character-animation-3-phase-4-pose-reliability-estimator` が `cameraQuality` 入力を読む。本タスクは production runtime からその既存入力へ値を渡すだけに限定する。

## 実装方針（既存コード整合: file:line）

- roadmap は production observe-only pipeline への CameraQuality 接続を残差としている（`documents/research/character_animation/roadmap.md:81`）。
- `SincroCharacterMotionEventSink.createObserveOnlyInput()` は現在 `mediaTimeMs`、`receivedAtMs`、`video` だけを返す（`sincromisor-frontend/src/app/controller/sincroCharacterMotionEventSink.ts:141`）。
- `SincroMotionObserveOnlyPipeline.updateDownstream()` は `createPoseReliabilityMap()` に `pose`、`hand`、`face`、`previous`、`mediaTimeMs`、`video` を渡しているが、`cameraQuality` は渡していない（`sincromisor-frontend/src/character/runtime/sincroMotionObserveOnlyPipeline.ts:190`）。
- `createPoseReliabilityMap()` は optional `cameraQuality` をすでに読み、`camera.cameraQualityScore` と component `cameraQuality` を作る（`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:56`、`sincromisor-frontend/src/character/reliability/poseReliabilityEstimator.ts:72`）。
- `CameraQualityScore` の保存 contract は raw device id / label を含めない（`sincromisor-frontend/src/features/gaze/trackingRuntime/cameraQualityScoreTypes.ts:40`、`documents/design/frontend/character/tracking.md:151`、`documents/design/frontend/character/tracking.md:153`）。
- production `startSincroFaceTracking()` は `nextVideoTrack` を持っているため、track settings reader はここから `SincroCharacterMotionEventSink` へ注入できる（`sincromisor-frontend/src/app/controller/sincroCharacterGazeController.ts:252`）。

## テスト

- `sincromisor-frontend/src/app/controller/__tests__/sincroCameraQualityRuntime.test.ts` を追加し、bounded history、raw identifier scrub、bad quality score、reset を検証する。
- `sincromisor-frontend/src/character/runtime/__tests__/sincroMotionObserveOnlyPipeline.test.ts` または近傍の既存 test を拡張し、`cameraQuality` が `ReliabilityMap.camera` と component に反映されることを検証する。
- `cd sincromisor-frontend && npm run test -- sincroCameraQualityRuntime sincroMotionObserveOnlyPipeline`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な production motion pipeline の reliability 入力が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` を同期する。公開 WebRTC / backend 契約は変更しない。
