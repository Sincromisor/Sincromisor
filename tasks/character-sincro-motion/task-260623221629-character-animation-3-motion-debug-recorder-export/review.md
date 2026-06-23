# Review: task-260623221629-character-animation-3-motion-debug-recorder-export

## 判定

APPROVED

直前レビューの blocking 指摘だった strict schema との矛盾と recorder core signature 未確定は解消されている。公開 debug API / export 挙動の変更に対する設計文書同期も受け入れ条件に明記されており、実装へ進めてよい。

## 指摘事項

（なし）

## 実装者への申し送り

- frame payload は task.md:19 のとおり、既存 strict schema の top-level slot 内に収めること。`timestamp.receivedAtPerformanceMs` と top-level `tracker` は追加せず、`metrics.receivedAtPerformanceMs` / `metrics.tracker` に入れる。
- `MotionDebugApp` が full manifest を生成して `MotionDebugRecorder.start()` に渡す前に camera settings を scrub すること。`deviceIdHash` / `groupIdHash` は同一 export 内だけ比較可能にするため、export 単位の salt を使うなど、raw ID や cross-export stable hash を残さない実装にする。
- `MotionDebugApi` 型は `sincromisor-frontend/src/pages/motionDebug/types.ts` の window API 正本なので、`startRecording()` / `stopRecording()` / `downloadRecording()` / `getRecordingState()` 追加時にここも同期すること。
- recorder core は DOM download と UI に依存させず、`src/character/motionEvaluation/` 内で schema validation、dedupe、maxDuration/maxFrames stop、NDJSON/Blob export を閉じること。DOM link 生成と control 表示は `src/pages/motionDebug/` 側へ閉じる。
- テストでは少なくとも manifest/frame validation、duplicate frame skip、`maxDurationMs` / `maxFrames` stop、`not_stopped` / `no_frames`、CompressionStream/Brotli fallback の state 反映を確認すると受け入れ条件を追いやすい。
