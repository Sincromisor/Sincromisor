# character animation 3.0 motion debug recorder export

## 背景 / 目的

Phase 1 の評価基盤では、ライブ camera / fixture 実行中の motion pipeline 状態を構造化ログとして保存できる必要がある。現行 `motion-debug` は PNG capture と JSON snapshot 表示を持つが、フレーム列を manifest 付き NDJSON として export する recorder はない。

このタスクでは、`task-260623221623-character-animation-3-motion-debug-log-schema` で定義した log v1 schema に従い、`motion-debug` で短時間の記録、NDJSON 生成、gzip/Brotli または plain NDJSON download を実装する。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionDebugRecorder.ts` を追加し、`MotionDebugRecorder`、`MotionDebugRecorderConfig`、`MotionDebugRecorderState` を export する。
- [ ] recorder は `start(manifestInput)`、`recordFrame(frameInput)`、`stop()`、`exportNdjson()`、`exportBlob({ compression })` を持つ。`compression` は `"none" | "gzip" | "brotli"` とし、ブラウザが `CompressionStream` 非対応または `"brotli"` 非対応のときは `"none"` へ fallback し、その理由を state に残す。
- [ ] recorder / window API の最小 signature と state shape は本タスクの「設計判断」にある型に固定する。未開始・記録中・停止済み・上限停止・圧縮 fallback の戻り値を実装者判断にしない。
- [ ] `MotionDebugApp` に record 開始 / 停止 / download の内部 API を追加し、`window.__SINCRO_MOTION_DEBUG__` から `startRecording()`、`stopRecording()`、`downloadRecording()`、`getRecordingState()` を呼べるようにする。
- [ ] `motion-debug` 画面に record / stop / download controls を追加する。既存の PNG capture は残し、構造化 motion log export と混同しない表示にする。
- [ ] manifest の `source.kind` は camera 実行時 `"live-camera"`、`loadVideoFixture()` 実行時 `"video-fixture"`、未起動時は recording 開始不可にする。
- [ ] `MediaStreamTrack.getSettings()` から取得した camera settings は export 前に scrub し、`deviceId` / `groupId` は raw 値を保存しない。保存する場合は同一 export 内だけ比較可能な SHA-256 hash を `deviceIdHash` / `groupIdHash` に入れる。
- [ ] frame 生成は pose callback / pose fallback callback 起点に固定し、render loop は recording state 表示だけを更新する。`handlePoseMotion()` / `handlePoseFallback()` から `recordFrame()` を呼び、同一 `video.currentTime` かつ同一 pose `lastUpdatedAtMs` の連続入力は重複 frame として捨てる。
- [ ] frame payload は最低限 `timestamp.mediaTimeMs`、`timestamp.receivedAtPerformanceMs`、`video.width`、`video.height`、`poseSnapshot`、`tracker`、`solver.poseRetarget`、`solver.poseRetargetRuntime` を保存する。normalized pose replay 用の field 名は依存 schema と同じ `frame.poseSnapshot` に固定する。
- [ ] 10 秒以上の recording で `parseMotionDebugLogLines()` が manifest と frame records を validation できる。
- [ ] `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` へ record/export API、camera setting scrub、schema validation、frame 記録起点を同期する。

## 設計判断（着手前に確定済み）

- recorder core は `src/character/motionEvaluation/` に置き、DOM download と UI control は `src/pages/motionDebug/` に閉じる。
- `requestVideoFrameCallback` 連携はこのタスクでは必須にしない。Phase 3 の FrameClock 前でも Phase 1 を進めるため、v1 は `video.currentTime` と `performance.now()` を保存し、`requestVideoFrameCallback` metadata slot は optional にする。
- export 形式の第一候補は NDJSON text、圧縮は browser capability に応じた best effort とする。圧縮失敗で recording 内容を失うより、plain NDJSON を返すことを優先する。
- recorder は ring buffer ではなく、初期実装では `maxFrames` と `maxDurationMs` による明示上限でメモリを守る。初期値は `maxDurationMs: 30000`、`maxFrames: 1800` とし、超過時は stop して state reason を残す。
- 生 video frame image と overlay PNG は構造化 log へ保存しない。Phase 1 raw result replay の主データは snapshot / raw result / retarget state とし、画像は既存 `captureFrame()` の責務に留める。

recorder core の最小 API:

```ts
type MotionDebugRecorderConfig = {
    maxDurationMs: number; // default 30000
    maxFrames: number; // default 1800
    compression: "none" | "gzip" | "brotli"; // default "gzip"
};

type MotionDebugRecorderState = {
    status: "idle" | "recording" | "stopped" | "exporting" | "error";
    frameCount: number;
    startedAtIso?: string;
    durationMs: number;
    stopReason?: "user" | "max_duration" | "max_frames" | "source_stopped" | "error";
    compression: "none" | "gzip" | "brotli";
    compressionFallbackReason?: string;
    lastError?: string;
};

type MotionDebugRecorderResult =
    | { ok: true; state: MotionDebugRecorderState }
    | { ok: false; code: "source_not_ready" | "already_recording" | "not_recording" | "no_frames" | "export_failed"; message: string; state: MotionDebugRecorderState };
```

window API の最小 signature:

```ts
startRecording(config?: Partial<MotionDebugRecorderConfig>): MotionDebugRecorderResult;
stopRecording(): MotionDebugRecorderResult;
downloadRecording(options?: { compression?: "none" | "gzip" | "brotli" }): Promise<
    | { ok: true; fileName: string; mimeType: string; byteLength: number; state: MotionDebugRecorderState }
    | { ok: false; code: "not_stopped" | "no_frames" | "export_failed"; message: string; state: MotionDebugRecorderState }
>;
getRecordingState(): MotionDebugRecorderState;
```

`downloadRecording()` の既定 compression は `"gzip"`、file name は `sincro-motion-debug-${ISO_STAMP}.ndjson`、圧縮成功時は `.ndjson.gz` または `.ndjson.br` にする。recording 中の download は `not_stopped` を返す。stop 後の再 export は許可する。

## スコープ境界

- 本タスクでやること:
    - motion debug log の record / stop / export。
    - camera settings scrub。
    - `motion-debug` の window API と UI controls。
    - export した NDJSON の schema validation。
- 本タスクでやらないこと:
    - replay player 実装。
    - metrics summary 計算。
    - canonical / temporal / intent の中身生成。
    - video fixture の再推論 replay。

## 実装方針（既存コード整合: file:line）

- `MotionDebugApp` は `TrackerRuntime`、`CharacterBehaviorState`、`VRMScene` を接続するページ所有境界である（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:69`）。recording の起動停止はこのクラスへ追加し、tracker / VRM controller へ直接 DOM を持ち込まない。
- camera / fixture の起動は `startRuntimeWithStream()` に集約され、`cameraSource` が `"camera"` / `"fixture"` へ設定される（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:211`）。manifest の `source.kind` はこの state から作る。
- pose callback は `handlePoseMotion()` と `handlePoseFallback()` に集約されている（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:274`、`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:281`）。frame record の pose snapshot 保存はここで行う。
- window API は `installWindowApi()` で構築され、現状は `startCamera()`、`loadVideoFixture()`、`getSnapshot()`、`captureFrame()` 等を公開している（`sincromisor-frontend/src/pages/motionDebug/motionDebugApp.ts:300`）。recording API はここに追加する。
- 現行 `MotionDebugControls` は DOM control と callbacks を分離している（`sincromisor-frontend/src/pages/motionDebug/motionDebugControls.ts:17`）。record controls も同じ callback pattern へ追加する。
- PNG capture は `MotionDebugFrameCapture.capture()` で data URL を作る（`sincromisor-frontend/src/pages/motionDebug/motionDebugFrameCapture.ts:4`）。motion log export はこの class へ混ぜず、新規 recorder へ分ける。

## テスト

- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run build`
- Playwright または手動で `motion-debug` を開き、fixture または camera 起動後に 10 秒以上 record して download した NDJSON を parser に通す。実 camera が使えない場合は `loadVideoFixture()` 経路で検証し、結果を `impl.md` に残す。
- `npm run tasks:check`

## ドキュメント同期の要否

要。`documents/design/frontend/character/motion.md` の `motion-debug` 責務と `documents/design/frontend/character/tracking.md` の tracker/debug 境界に、record/export API、camera setting scrub、schema validation を同期する。
