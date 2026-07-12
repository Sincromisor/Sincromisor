# Review: task-260624222255-character-animation-3-video-frame-clock

## 判定

APPROVED

Critical / High の blocking 指摘はない。受け入れ条件は `VideoFrameClock`、timestamp contract、fallback、dedupe、motion debug log / window snapshot、旧 log 互換、設計文書同期まで検証可能な形で定義されており、公開挙動変更に対する文書同期も完了条件に明記されている。

## 指摘事項

- なし

## 実装者への申し送り

- 現行 `TrackerRuntimeCallbacks` は `onFaceMotion(snapshot)` / `onPoseMotion(snapshot)` のみで frame timing を運ぶ引数がない（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntimeTypes.ts:8`）。task.md は「pose snapshot または runtime から渡された frame timing」として成果物を固定しているため blocking ではないが、callback 第2引数など、既存 snapshot field を壊さない伝播経路を一貫して選ぶこと。
- `TrackerRuntime.predict()` は現在 `performance.now()` と `video.currentTime` 重複チェックで cadence を決めている（`sincromisor-frontend/src/features/gaze/trackingRuntime/trackerRuntime.ts:141`、`:147`、`:162`）。変更後は MediaPipe / Worker の detect timestamp と cadence 判定を `mediaTimeMs` に寄せ、worker transfer / round trip の計測だけ `performance.now()` に残す点を確認する。
- `MotionDebugRecordingController.recordPoseFrame()` は現状 `video.currentTime * 1000` だけを保存する（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:98`、`:119`）。新 timing を保存する際も `frame.metrics.receivedAtPerformanceMs` は metrics 側に残し、`timestamp.receivedAtPerformanceMs` や top-level `tracker` を増やさない既存方針（`documents/design/frontend/character/motion.md:135`）に従うこと。
- `parseMotionDebugLogLines()` は strict schema なので、optional timestamp field 追加時は旧 v1 の `timestamp.mediaTimeMs` だけの frame を引き続き受け入れる test を必ず残す（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:82`、`:95`）。
- 確認観点は task.md の指定どおり、`videoFrameClock`、`motionDebugLogSchema`、`motionDebugRecorder` の unit test、`npm run build`、`npm run check`、`npm run tasks:check` に加え、可能なら `motion-debug` で `window.__SINCRO_MOTION_DEBUG__.getSnapshot().camera.frameTiming` 相当と NDJSON の `frame.timestamp.clockSource` / `presentedFrames` を確認すること。
