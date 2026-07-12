# Implementation Log: task-260624013721-character-animation-3-canonical-debug-replay-integration

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- `MotionDebugSnapshot.canonical` は task.md の最小 integration shape に合わせ、`CanonicalUpperBodyState | CanonicalLayerParseError` とした。invalid canonical は replay failure にせず、`parseStatus: "invalid"`、parse errors、raw payload を snapshot / viewer layer value に載せる。
- canonical 生成は motion-debug page 境界に閉じた。`MotionDebugRecordingController.recordPoseFrame()` が `estimateCanonicalTorsoFrame()` の結果を `createCanonicalUpperBodyState()` に渡し、recorder の `frame.canonical` に保存する。TrackerRuntime / worker には canonical 依存を入れていない。
- previous canonical は controller 側で保持し、recording/live の連続 frame では torso estimator の previous として渡す。recording stop、source stop、replay load では reset する。
- replay `pose-snapshot` は saved `frame.canonical` を優先して parse し、valid は latest canonical に反映、invalid は parse error summary にする。`frame.canonical` が無い古い log では replay pose snapshot から live fallback canonical を作る。
- viewer canonical layer は replay frame canonical を優先し、無い場合だけ live snapshot canonical に fallback する。layer status union は増やしていない。
- docs は `documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` に同期した。保存起点、viewer 表示、invalid canonical の扱いを追記済み。

### 検証

- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- motionDebugRecorder`
- `cd sincromisor-frontend && npm run test -- canonical`
- `cd sincromisor-frontend && npm run test -- motionReplayPlayer motionDebugViewerModel motionDebugRecorder canonical`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run tasks:check`
- `npm run gate`

### 詰まり / 回避

- 実装 worktree に root `node_modules` が無く、初回 `npm run tasks:check` は `yaml` 解決不能で失敗した。main checkout の root `node_modules` への一時 symlink を worktree に作って `tasks:check` と `gate` を通し、完了後に symlink は削除した。

### 残リスク

- 手動または Playwright で実カメラ / fixture recording の NDJSON ダウンロード確認は未実行。unit test と gate で `frame.canonical` の保持、parse 成功、viewer valid / invalid 表示境界は確認済み。
