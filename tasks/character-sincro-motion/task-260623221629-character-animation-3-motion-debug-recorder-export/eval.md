# Evaluation: task-260623221629-character-animation-3-motion-debug-recorder-export

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `motionDebugRecorder.ts` の追加と `MotionDebugRecorder` / `MotionDebugRecorderConfig` / `MotionDebugRecorderState` export — commit `8c5c12a` で recorder core と型 re-export を確認。
- [✓] `start()` / `recordFrame()` / `stop()` / `exportNdjson()` / `exportBlob({ compression })` と `"none" | "gzip" | "brotli"` fallback — `motionDebugRecorder.test.ts` の CompressionStream 非対応 / Brotli fallback / no_frames / not_stopped / limit stop テストと実装を確認。
- [✓] recorder / window API の最小 signature と state shape 固定 — `motionDebugRecorderTypes.ts` と `pages/motionDebug/types.ts` が task.md の shape に対応していることを確認。
- [✓] `MotionDebugApp` の record 開始 / 停止 / download 内部 API と `window.__SINCRO_MOTION_DEBUG__` 公開 — `motionDebugApp.ts` の `startRecording()` / `stopRecording()` / `downloadRecording()` / `getRecordingState()` と `installWindowApi()` を確認。
- [✓] `motion-debug` 画面の record / stop / download controls 追加と PNG capture の分離維持 — `index.html` / `motionDebugControls.ts` で `Record` / `Stop Log` / `Download Log` と既存 `Capture` / PNG download が別系統で残っていることを確認。
- [✓] manifest `source.kind` の live camera / video fixture 判定と未起動時の recording 開始不可 — `MotionDebugRecordingController.source()` が `"live-camera"` / `"video-fixture"` を返し、source または track が無い場合 `source_not_ready` を返すことを確認。
- [✓] camera settings scrub — `scrubCameraSettings()` が `width` / `height` / `frameRate` / `facingMode` のみを manifest に残し、raw `deviceId` / `groupId` を保存しないことを確認。
- [✓] frame 生成起点と duplicate skip — `handlePoseMotion()` / `handlePoseFallback()` から `recordPoseFrame()` を呼び、render loop は recorder state 表示更新のみ。recorder の `dedupeKey.mediaTimeMs` + `poseLastUpdatedAtMs` 連続一致 skip は単体テストで確認。
- [✓] frame payload の schema slot — `recordPoseFrame()` が `timestamp.mediaTimeMs`、`video.width/height`、`poseSnapshot`、`solver.poseRetarget`、`solver.poseRetargetRuntime`、`metrics.receivedAtPerformanceMs`、`metrics.tracker` を使い、`timestamp.receivedAtPerformanceMs` / top-level `tracker` を追加していないことを確認。strict schema で invalid frame を拒否するテストあり。
- [✓] 10 秒以上 recording の validation — 実 camera/browser download は未実行だが、`exportNdjson()` が manifest + frame records を毎回 `parseMotionDebugLogLines()` で検証し、単体テストで schema-valid export を確認。長時間時の追加分岐は maxDuration / maxFrames のみで、上限停止もテスト済み。
- [✓] `documents/design/frontend/character/motion.md` と `tracking.md` の同期 — record/export API、camera setting scrub、schema validation、frame 記録起点、metrics slot の記載を確認。

## テスト結果

- `cd /var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-8c5c12a801ef-bR8Fwd && npm run gate`: PASS
    - `gate:lint`: PASS（Biome 352 files、Markdown prettier check）
    - `gate:build`: PASS（`tsc -p tsconfig.modern.json && vite build`）
    - `gate:test`: PASS（Vitest 3 files / 26 tests）
- カバレッジ評価: recorder core の schema validation、duplicate skip、maxDuration / maxFrames stop、`not_stopped` / `no_frames`、CompressionStream / Brotli fallback は単体テストで十分に固定されている。`MotionDebugApp` の browser download と 10 秒以上の実 runtime 操作は環境制約により未実行だが、コード確認と gate により受け入れ条件の主要リスクはカバーされている。

## ドキュメント整合性

- 契約/公開挙動の変更あり: `window.__SINCRO_MOTION_DEBUG__` の debug API、structured motion log export、camera settings scrub、motion debug log frame 記録起点が公開 debug 挙動として変わっている。
- 同期状況: 同期済み。`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に API、schema validation、scrub、callback 起点、metrics slot が追記されている。

## 残課題（FAIL の場合）

- なし。

## 残リスク

- 実 camera / browser での 10 秒以上 record -> download -> parse の E2E は未実行。実機権限、MediaPipe runtime、DOM download 挙動を含むため、次の browser-capable 検証環境で fixture 経路または camera 経路の smoke を追加するとよい。
