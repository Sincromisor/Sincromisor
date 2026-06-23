# Review: task-260623221629-character-animation-3-motion-debug-recorder-export

## 判定
APPROVED

前回 High 指摘だった API/state shape、frame 記録起点、ドキュメント同期の受け入れ条件化はいずれも改訂で解消された。改訂により依存 schema の `frame.poseSnapshot` とも整合しており、新たな blocking 破綻は見当たらない。

## 指摘事項
- なし

## 実装者への申し送り
- `task.md:31-68` で window API の signature と state/result shape は固定されたが、`MotionDebugRecorder` core method の TypeScript signature は code block に直接列挙されていない。実装時は `MotionDebugRecorderResult` と `downloadRecording()` の戻り値方針に合わせ、未開始・記録中・停止済み・上限停止・圧縮 fallback の挙動をぶらさないこと。
- frame 記録は `task.md:18-19` の通り pose callback / pose fallback callback 起点に固定し、render loop から frame を追加しない。重複排除キーは `video.currentTime` と pose `lastUpdatedAtMs` の組み合わせとして扱う。
- 依存タスク `task-260623221623-character-animation-3-motion-debug-log-schema` の `frame.poseSnapshot`、`solver`、parser error code を正本にし、schema タスク完了後に実装すること。
- ドキュメント同期は `task.md:21` の受け入れ条件なので、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` の更新漏れを close 前に確認すること。
