# Implement MediaPipe raw result replay

## 背景 / 目的

`documents/research/character_animation/roadmap.md` は Phase 1 の残差として、`MotionReplayPlayer` の主経路が `pose-snapshot` replay のままで、`mediapipe-raw-result` replay が unsupported mode に残っていることを挙げている。現行コードでも `MotionReplayMode` は `"mediapipe-raw-result"` を含むが、実行時は必ず `unsupported_mode` を返す。

本タスクでは、recording の `frame.mediapipe` slot に保存した plain object raw result を replay 境界で parse し、ライブ camera なしで Pose / Hand / Face / Gesture の normalized snapshot 生成を再現できる raw result replay mode を実装する。video re-inference replay は扱わない。

## 完了条件（受け入れ条件）

- [ ] `sincromisor-frontend/src/character/motionEvaluation/motionReplayRawResultSchema.ts` を追加し、`SincroMotionReplayRawResultFrame` と parser を export する。最小 schema は `{ pose?: unknown; hand?: unknown; face?: unknown; gesture?: unknown; timing: { mediaTimeMs: number; videoWidth: number; videoHeight: number } }` とし、各 raw slot は plain JSON value のみ受け付ける。
- [ ] `frame.mediapipe` が欠損している `mediapipe-raw-result` replay は `code: "missing_mediapipe_raw_result"` を返し、`pose-snapshot` fallback へ暗黙に切り替えない。
- [ ] raw schema parse 失敗は `code: "parse_error"` を返し、どの slot が失敗したかを message または result detail で確認できる。
- [ ] `MotionReplayPlayer.startReplay({ mode: "mediapipe-raw-result" })` は `unsupported_mode` を返さず、raw frame を caller-provided `applyRawResult` callback へ渡す。`applyRawResult` が未指定の場合だけ `unsupported_mode` を返す。
- [ ] raw replay は existing `applyPoseSnapshot` と同じ `MotionReplayApplyContext` を渡し、`frameIndex`、`mediaTimeMs`、`frame` の意味を変えない。
- [ ] raw replay で生成する normalized snapshot は `SincroPoseMotionSnapshot`、`SincroHandMotionSnapshot`、`SincroFaceMotionSnapshot`、`SincroGestureMotionSnapshot` の既存 parser / normalizer 境界を通す。MediaPipe class instance、landmark object prototype、ImageBitmap、VideoFrame、crop object は log / replay result に保持しない。
- [ ] `motion-debug` recording は live frame で raw result serializer が利用可能な場合だけ `frame.mediapipe` を保存する。serializer 未対応の slot は省略し、空 object を「記録済み」として扱わない。
- [ ] manifest `build.packageVersions` と `build.configHash` は固定値 / 空 object のままにせず、少なくとも frontend package version、`@mediapipe/tasks-vision` version、pipeline config hash を保存する。取得不能な version は `"unknown"` とする。
- [ ] schema version は `sincro.motion-debug-log.v1` を維持し、`frame.mediapipe` は optional slot として後方互換にする。旧 log の `pose-snapshot` / `final-pose-playback` replay は挙動を変えない。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、`symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、`action`、`reviewer note` に固定し、少なくとも raw schema parser、`applyRawResult` callback、missing raw fallback 非採用、manifest build metadata、MediaPipe raw serializer 境界を含める。
- [ ] comment audit 記録だけでは完了扱いにしない。新規 public export、schema/parser、MediaPipe / replay boundary、fallback decision に必要な JSDoc/TSDoc の追加・更新、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- raw replay の入力は `frame.mediapipe` に限定する。`frame.poseSnapshot` から raw result を復元する案は、生観測値を後から捏造するため採用しない。
- video re-inference replay は本タスクで扱わない。roadmap でも後段でよいとされており、camera / video asset と MediaPipe runtime 再実行まで含めると 1 task が過大になる。
- `MotionReplayPlayerOptions` へ optional `applyRawResult(raw, context)` を追加する。既存 `applyPoseSnapshot` の signature を変える案は既存 replay caller と test の変更範囲が大きいため採用しない。
- `frame.mediapipe` は optional slot とし、log schema major version は上げない。旧 log 互換を保ちつつ、raw replay mode だけが raw slot 欠損を error にする。
- build metadata は runtime で取得できる範囲の deterministic metadata に限定する。git command を browser runtime から呼ぶ案は不可能であり採用しない。
- 公開 WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## スコープ境界

- 本タスクでやること: raw result schema / parser、`MotionReplayPlayer` raw mode、motion-debug raw slot 保存、manifest build metadata、unit test、design docs sync。
- 本タスクでやらないこと: video re-inference replay、MediaPipe model asset の変更、new ML / post-processing、VRM pose application の変更、user-facing UI の新規導線、backend / WebRTC 契約変更。
- 依存タスクとの境界: `task-260623221635-character-animation-3-mediapipe-raw-replay-player` は mode 予約と pose-snapshot replay を提供済み。本タスクはその unsupported raw mode を実行可能にする。

## 実装方針（既存コード整合: file:line）

- `MotionReplayMode` は既に `"mediapipe-raw-result"` を含む（`sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts:13`）。
- 現在の raw mode は `unsupported_mode` を返すだけである（`sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts:185`）。
- `MotionReplayPlayerOptions` は `applyPoseSnapshot` と optional `previewFinalPose` を持つ（`sincromisor-frontend/src/character/motionEvaluation/motionReplayPlayer.ts:57`）。ここへ optional `applyRawResult` を追加する。
- log frame schema には `mediapipe: z.unknown().optional()` が予約済みである（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:115`、`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:120`）。
- manifest build schema は `appVersion`、`gitCommit`、`packageVersions`、`configHash` を持つ（`sincromisor-frontend/src/character/motionEvaluation/motionDebugLogSchema.ts:44`）。
- recording manifest は現在 `appVersion: "0.0.0"`、`packageVersions: {}`、`configHash: "motion-debug-default"` を固定で保存している（`sincromisor-frontend/src/pages/motionDebug/motionDebugRecordingController.ts:316`）。

## テスト

- `cd sincromisor-frontend && npm run test -- motionReplayPlayer motionDebugLogSchema motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- motionDebugRecordingController`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`

## ドキュメント同期の要否

要。developer-visible な motion-debug log / replay mode の契約が変わるため、`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に raw replay mode、raw slot 欠損時の error、build metadata、video re-inference 非対象を同期する。公開 WebRTC / backend 契約は変更しない。
