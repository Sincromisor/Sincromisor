# character animation 3.0 video frame clock

## 背景 / 目的

`documents/research/character_animation/roadmap.md` の Phase 3 は、`requestAnimationFrame` 基準の推論 loop から video frame 基準の clock へ移行し、`mediaTime`、`presentationTime`、`expectedDisplayTime`、`presentedFrames`、dropped frame を記録することを求めている。

現行 `TrackerRuntimeFrameLoop` は RAF だけで `predict()` を呼び、`TrackerRuntime` は `performance.now()` と `video.currentTime` の重複チェックで推論 cadence を決めている。そのため Pose / Face snapshot、motion debug log、worker stats の時刻が「どの動画フレームに紐づく観測か」を一意に説明できない。

このタスクでは Phase 3 の土台として `VideoFrameClock` を導入し、推論起動を video frame metadata 基準へ寄せる。CameraQualityScore、performance budget、ReliabilityMap は後続タスクで扱い、本タスクでは時刻 contract と fallback のみを確定する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/videoFrameClock.ts` を追加し、`HTMLVideoElement.requestVideoFrameCallback()` 対応環境では video frame ごとに `TrackerVideoFrameTiming` を生成して callback へ渡す。
- [ ] `requestVideoFrameCallback()` 非対応環境では `requestAnimationFrame + video.currentTime` fallback を使い、さらに RAF が利用できない test / hidden runtime 境界では 5fps の timer fallback を使う。fallback でも `mediaTimeMs` と `receivedAtPerformanceMs` は finite number になり、rVFC 固有 field は `undefined` にする。
- [ ] `TrackerVideoFrameTiming` は `source`、`receivedAtPerformanceMs`、`mediaTimeMs`、`videoCurrentTimeMs`、optional `presentationTimeMs`、optional `expectedDisplayTimeMs`、optional `presentedFrames`、`droppedPresentedFrames` を持つ。`droppedPresentedFrames` は同一 clock instance 内の前回 `presentedFrames` から算出し、初回または fallback では `0` にする。
- [ ] `TrackerRuntimeFrameLoop` は `predict: (timing: TrackerVideoFrameTiming) => void` を受け取り、推論 loop の scheduling と cancellation を `VideoFrameClock` に委譲する。`stop()` 後に rVFC / RAF / timer callback が遅れて発火しても `predict()` は呼ばれない。
- [ ] `TrackerRuntime` は Face / Pose / Worker detect に渡す timestamp を `performance.now()` ではなく `timing.mediaTimeMs` に統一し、cadence 判定の `nowMs` も同じ `mediaTimeMs` を使う。Worker round trip や transfer cost の計測だけは `performance.now()` を使い続ける。
- [ ] `MotionDebugRecordingController.recordPoseFrame()` は `video.currentTime * 1000` ではなく、pose snapshot または runtime から渡された frame timing の `mediaTimeMs` を `frame.timestamp.mediaTimeMs` に保存する。対応する `frame.timestamp` には optional で `presentationTimeMs`、`expectedDisplayTimeMs`、`presentedFrames`、`droppedPresentedFrames`、`clockSource` を保存する。
- [ ] `parseMotionDebugLogLines()` は旧 v1 log の `timestamp.mediaTimeMs` だけの frame を引き続き受け入れ、新 field が存在する場合は finite number / enum として validation する。
- [ ] `motion-debug` の `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` から、最新 frame timing を `camera.frameTiming` または同等の field で確認できる。既存 top-level `status`、`camera.source`、`camera.width`、`camera.height`、`pose`、`tracker`、`canonical` の field 名は変更しない。
- [ ] rVFC metadata が同じ `presentedFrames` で連続した場合、recorder は既存 dedupe と同じく duplicate frame として保存を増やさない。`presentedFrames` が 2 以上進んだ場合は `droppedPresentedFrames` に `差分 - 1` が記録される。
- [ ] `sincromisor-frontend/src/features/gaze/trackingRuntime/__tests__/videoFrameClock.test.ts` を追加し、rVFC、RAF fallback、timer fallback、stop 後 callback 無効化、dropped frame 算出を検証する。
- [ ] `motionDebugLogSchema` または recorder の test を更新し、旧 timestamp だけの log と新 timestamp field 付き log の双方を parse できることを検証する。
- [ ] `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に、推論 timestamp が video `mediaTimeMs` 基準になったこと、`frame.timestamp` の追加 field、fallback 方針を同期する。

## 設計判断（着手前に確定済み）

- 新規 runtime は `sincromisor-frontend/src/features/gaze/trackingRuntime/videoFrameClock.ts` に置く。`TrackerRuntimeFrameLoop` に rVFC 実装を直接埋め込む案は、fallback と単体テストが膨らみ既存 loop クラスが読みにくくなるため採用しない。
- 型は `sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts` に export する。

```ts
export type TrackerVideoFrameClockSource =
    | "request-video-frame-callback"
    | "request-animation-frame"
    | "timer";

export type TrackerVideoFrameTiming = {
    source: TrackerVideoFrameClockSource;
    receivedAtPerformanceMs: number;
    mediaTimeMs: number;
    videoCurrentTimeMs: number;
    presentationTimeMs?: number;
    expectedDisplayTimeMs?: number;
    presentedFrames?: number;
    droppedPresentedFrames: number;
};
```

- MediaPipe `detectForVideo()` に渡す timestamp は `mediaTimeMs` に固定する。`performance.now()` を維持する案は Worker round trip と同じ原点で扱いやすいが、同一 video frame に Pose / Face / replay log を紐付ける Phase 3 の目的に合わないため採用しない。
- `receivedAtPerformanceMs` は latency / worker cost 計測用であり、`mediaTimeMs` との差分を latency として扱わない。両者は時刻原点が異なるため、差分を取る計算は本タスクの実装にもテストにも入れない。
- rVFC metadata の `mediaTime` は秒なので `mediaTimeMs = mediaTime * 1000` へ変換する。RAF / timer fallback は `video.currentTime * 1000` を使い、`video.currentTime` が非 finite の場合だけ `0` に丸めて `source` は fallback のまま残す。
- `frame.timestamp.clockSource` は `TrackerVideoFrameClockSource` と同じ文字列 union にする。`source` という field 名は `manifest.source` と混同しやすいため、frame timestamp 内では `clockSource` に固定する。
- 外部境界は browser API のみで、network / backend 契約は変更しない。rVFC が存在しない、metadata field が欠損する、callback が stop 後に発火する場合はいずれも throw せず fallback / ignore で処理する。

## スコープ境界

- 本タスクでやること:
    - `VideoFrameClock` の追加。
    - `TrackerRuntime` の推論 timestamp を video frame 基準へ変更。
    - motion debug log / snapshot への frame timing 保存。
    - 旧 log 互換を保った schema / parser 更新。
    - tracking / motion 設計文書の同期。
- 本タスクでやらないこと:
    - CameraQualityScore の算出。
    - UX 向け camera guide 文言の生成。
    - ReliabilityMap、TemporalStateEstimator、MotionIntent の実装。
    - Worker を必須化すること、main-thread fallback を削除すること。
    - Pose / Hand / Face / Gesture の raw result serializer 追加。
    - 既存 WebRTC / backend 契約の変更。
- 依存タスクとの境界:
    - 依存元 `task-260624013721-character-animation-3-canonical-debug-replay-integration` は canonical の保存と viewer 表示までを担当する。本タスクは同じ recording / snapshot 経路へ frame timing を追加するだけで、canonical の schema や値生成は変更しない。

## 実装方針（既存コード整合: file:line）

- `TrackerRuntimeFrameLoop` は現在 `predict: () => void` を受け取り RAF で `this.predict()` を呼ぶだけである（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts:1`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeFrameLoop.ts:36`）。ここを `VideoFrameClock` adapter に置き換える。
- `TrackerRuntime.predict()` は現在 `performance.now()` を `nowMs` として cadence / detect に使い、`video.currentTime === lastVideoTime` で duplicate frame を避けている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:141`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:147`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:162`）。本タスクでは `TrackerVideoFrameTiming.mediaTimeMs` を cadence と detect timestamp の正本にする。
- Worker 経路は `createImageBitmap(videoElement)` の transfer time を `performance.now()` で測り、`workerClient.detect(frame, nowMs, runPose, transferTimeMs)` へ timestamp を渡している（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:187`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:197`、`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:200`）。timestamp 引数だけ `mediaTimeMs` に変え、transfer / round trip の計測原点は変更しない。
- Face tracker と Pose tracker は `detectForVideo(videoFrame, timestampMs)` の戻りを snapshot `lastUpdatedAtMs` に保存している（`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:42`、`sincromisor-frontend/src/features/gaze/faceTracking/sincroFaceTracker.ts:60`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts:56`、`sincromisor-frontend/src/features/gaze/poseTracking/sincroPoseTracker.ts:79`）。本タスク後はこの値が video media time になるため、設計文書に明記する。
- `MotionDebugRecordingController.recordPoseFrame()` は現在 `video.currentTime * 1000` を `mediaTimeMs` にしている（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:98`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:101`、`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:119`）。本タスクでは runtime timing を優先し、欠損時だけ従来計算へ fallback する。
- motion debug log schema は現在 `timestamp.mediaTimeMs` だけを strict schema として持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:82`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:95`）。optional field を追加し、既存 v1 log を壊さない。
- `documents/design/frontend/character/tracking.md` は TrackerRuntime の責務と motion debug recording 境界を説明している（`documents/design/frontend/character/tracking.md:31`、`documents/design/frontend/character/tracking.md:61`、`documents/design/frontend/character/tracking.md:107`）。同文書へ clock source と timestamp 原点を同期する。
- `documents/design/frontend/character/motion.md` は motion evaluation log の `frame.timestamp.mediaTimeMs` と `receivedAtPerformanceMs` の扱いを説明している（`documents/design/frontend/character/motion.md:127`、`documents/design/frontend/character/motion.md:132`、`documents/design/frontend/character/motion.md:135`）。追加 field と差分禁止方針を同期する。

## テスト

- `cd sincromisor-frontend && npm run test -- videoFrameClock`
- `cd sincromisor-frontend && npm run test -- motionDebugLogSchema`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run build`
- `cd sincromisor-frontend && npm run check`
- 手動または Playwright で `motion-debug` を開き、短時間 recording した NDJSON の `frame.timestamp.clockSource`、`mediaTimeMs`、rVFC 対応ブラウザでは `presentedFrames` が保存されることを確認する。実機 camera 権限が使えない場合は fixture / unit test で代替し、未実行理由を `impl.md` に残す。
- `npm run tasks:check`

## ドキュメント同期の要否

要。WebRTC / backend の公開通信契約は変えないが、developer 向け `motion-debug` window API snapshot と motion debug log の保存内容が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に frame clock、timestamp 原点、fallback、追加 timestamp field を同期する。
