# Review: task-260623221635-character-animation-3-mediapipe-raw-replay-player

## 判定
APPROVED

前回の blocking High は解消済み。`frame.poseSnapshot`、mode union、result / window API schema、文書同期の受け入れ条件が task.md に追加され、依存 task 側の schema / recorder も同じ field 名へ揃っている。

## 指摘事項
なし。

## 実装者への申し送り
- `MotionReplayMode` は `"pose-snapshot" | "final-pose-playback" | "mediapipe-raw-result"` で固定され、`"mediapipe-raw-result"` は Phase 1 では呼び出し可能だが常に `unsupported_mode` を返す前提で実装すること（`task.md:12`、`task.md:32-36`）。
- replay が読む normalized pose は `frame.poseSnapshot` に固定されている。依存 task 側も schema と recorder の保存 field を `frame.poseSnapshot` に揃えているため、実装時に別名へ逃がさないこと（schema task `task.md:15`、recorder task `task.md:19`）。
- `loadRecording()` は plain NDJSON `string` または `File` のみを受け、compressed Blob import は本タスク外。エラーは `parse_error` / `unsupported_input` など task.md の union に合わせて deterministic に返すこと（`task.md:16`、`task.md:46`）。
- `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` の同期は完了条件に入っているため、実装と同じタスク内で更新すること（`task.md:19`）。
