# Implementation Log: task-260623221629-character-animation-3-motion-debug-recorder-export

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / review.md 申し送り対応

- recorder core は `src/character/motionEvaluation/` に置き、schema validation、dedupe、maxDuration / maxFrames stop、NDJSON / Blob export を DOM/UI 非依存にした。DOM download link 生成と manifest/frame assembly は `src/pages/motionDebug/` 側へ分離した。
- frame payload は strict schema の top-level slot だけを使い、callback 受信時刻と tracker stats は `frame.metrics.receivedAtPerformanceMs` / `frame.metrics.tracker` に保存した。`timestamp.receivedAtPerformanceMs` と top-level `tracker` は追加していない。
- `startRecording()` は同期 API 指定のため、camera `deviceId` / `groupId` は hash せず raw 値ごと除去した。cross-export stable hash を残さないための最小リスク方針。
- `MotionDebugApi` 型は `src/pages/motionDebug/types.ts` に recording API / state / download result を同期した。
- 圧縮は `gzip` のみ `CompressionStream` を使い、Brotli request と CompressionStream 非対応は plain NDJSON fallback として state に理由を残す。Brotli は DOM 型とブラウザ実装差が大きいため、v1 は内容喪失回避を優先した。
- ドキュメント同期は `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に反映済み。record/export API、camera settings scrub、schema validation、pose callback 起点、metrics slot の扱いを追記した。

### 検証

- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS
- `npm run tasks:check`: PASS。一回目は worktree root に `node_modules/yaml` が無く失敗したため、main checkout の root `node_modules` への一時 symlink を作って再実行し、PASS 後に symlink は削除した。

### 未実行 / 残リスク

- 実 camera / browser での 10 秒以上の手動 download 検証は未実行。CI で再現しにくい camera 権限と MediaPipe runtime を含むため、今回は recorder 単体テストと build/gate で schema validation、dedupe、limit stop、fallback state を固定した。
- `motion-debug` の retarget runtime snapshot は pose callback 受信時点で Debug Console にある最新値を保存する。render loop 後の完全同期値ではない可能性があるため、文書に callback 起点として記録した。
