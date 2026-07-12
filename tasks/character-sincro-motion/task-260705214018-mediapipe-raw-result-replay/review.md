# Review: task-260705214018-mediapipe-raw-result-replay

## 判定

APPROVED

Critical / High の blocking 指摘はない。raw replay mode、保存 slot、schema/parser、fallback 非採用、docs sync、TypeScript production comment audit が受け入れ条件に含まれており、既存コード参照も現状と整合している。

## 指摘事項

なし

## 実装者への申し送り

- `MotionReplayPlayer` の現状は `motionReplayPlayer.ts:13` で mode を予約し、`:185` から `unsupported_mode` を返している。`applyRawResult` 未指定時だけ unsupported にする条件を崩さないこと。
- `motionDebugLogSchema.ts:115` から `:120` の `frame.mediapipe` は optional `unknown` slot として既に予約済み。`schemaVersion` は `sincro.motion-debug-log.v1` のまま、旧 `pose-snapshot` / `final-pose-playback` replay を変えないこと。
- raw slot は plain JSON 境界に閉じること。MediaPipe class instance、landmark object prototype、ImageBitmap、VideoFrame、crop object を保存しない点は `documents/design/frontend/character/tracking.md:151` から `:159` の replay 境界と同期して確認すること。
- manifest build metadata は `motionDebugRecordingController.ts:316` から `:320` の固定値を置き換える作業になる。hash の入力は pipeline config として実装ログに明記し、取得不能 version は `"unknown"` に固定すること。
