# Implementation Log: task-260627234128-character-animation-3-0-phase-10-runtime-performance-profile

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / 申し送り対応

- 実装コミット: `85d9f57bbcbafc8fb1e26aeeca3a965926f68e01`
- resolver 入力 contract は task.md 指定の `{ performanceProfileId?: string; performanceProfile?: unknown; defaultProfileId?: TrackerRuntimePerformanceProfileId }` に固定した。通常 default は resolver 内で `standard-laptop`、motion-debug 呼び出しは caller 側で `defaultProfileId: "debug"` を渡す形にした。
- active profile の live snapshot は `getSnapshot().camera.performanceProfile`、recording は `manifest.pipeline.performanceProfile` のみに保存した。`tracker.budget` と frame metrics へ profile は重複保存していない。
- motion-debug の fixed `POSE_TARGET_INFERENCE_FPS` override は削除し、未指定 debug default では debug profile の `poseFps = 12` により現行挙動を維持した。`performanceProfileId` 指定時は profile cadence が Pose fps default になる。
- `requestMotionDebugCameraStream()` は profile camera から `ideal` / `max` constraints を作るようにし、`exact` / 強い `min` は使わない方針にした。
- `npm run check` が worktree 内の既存 task `review.md` 4 件の Markdown 整形不一致で失敗したため、内容を変えず Prettier の空行整形だけを worktree 側で適用した。これは gate 通過のための整形で、仕様変更ではない。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` に performance profile v1 schema、4 profile の camera / cadence / debug log / degradation budget、resolver default と明示 fps override 方針を同期した。
- `documents/design/frontend/character/motion.md` に motion-debug live snapshot canonical path、window API の profile 指定、recording manifest canonical path、frame metrics へ重複保存しない境界を同期した。

### 確認

- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceProfile`
- `cd sincromisor-frontend && npm run test -- motionDebugCameraStream`
- `cd sincromisor-frontend && npm run test -- motionDebugRecordingController`
- `cd sincromisor-frontend && npm run test -- motionDebugViewerModel`
- `cd sincromisor-frontend && npm run test -- trackerRuntimePerformanceProfile motionDebugCameraStream motionDebugRecordingController motionDebugViewerModel`
- `cd sincromisor-frontend && npm run check`
- `cd sincromisor-frontend && npm run build`
- `npm run gate`（commit `85d9f57`、lint / build / test PASS、44 files / 344 tests）

### 未実行 / 残リスク

- `npm run tasks:check` は実行したが、worktree root の `yaml` package が未展開で `ERR_MODULE_NOT_FOUND` となり完走できなかった。`npm run gate` は PASS 済み。
- ordered degradation policy は本タスクの非対象。profile の `degradationBudget` は後続 task が読む入力 contract として保存するだけで、自動 profile downgrade は実装していない。
