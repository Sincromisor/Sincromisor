# Implementation Log: task-260624222255-character-animation-3-video-frame-clock

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 判断 / review.md 申し送り対応

- `TrackerRuntimeCallbacks` は既存 snapshot field を変えず、callback 第 2 引数の `TrackerVideoFrameTiming` で timing を伝播した。通常の app controller は第 2 引数を無視し、motion-debug だけ latest timing を保持して recording / snapshot へ使う。
- MediaPipe Face / Pose と Worker detect timestamp、cadence 判定は `timing.mediaTimeMs` に統一した。Worker transfer time と round trip は従来どおり `performance.now()` を使う。
- recorder では `frame.metrics.receivedAtPerformanceMs` と `frame.metrics.tracker` を維持し、`timestamp.receivedAtPerformanceMs` や top-level `tracker` は追加していない。
- `parseMotionDebugLogLines()` は旧 v1 の `timestamp.mediaTimeMs` だけの frame を受け入れる test を残し、新 timestamp field 付き frame の parse test を追加した。
- `presentedFrames` がある場合は recorder dedupe で同一 `presentedFrames` を duplicate 扱いにし、`VideoFrameClock` 側で `droppedPresentedFrames = 差分 - 1` を算出する方針にした。

### ドキュメント同期

- `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に video frame clock、fallback、`mediaTimeMs` 原点、`camera.frameTiming`、`frame.timestamp` 追加 field、`receivedAtPerformanceMs` との差分禁止を同期した。
- `npm run gate` の Markdown check が既存の別タスク文書 4 件の Prettier 警告で落ちたため、実装 worktree 側で該当 4 件を Prettier 整形した。内容変更ではなく空行 / コードブロック整形のみ。

### 検証

- `npm run test -- videoFrameClock`
- `npm run test -- motionDebugLogSchema`
- `npm run test -- motionDebugRecorder`
- `npm run test -- videoFrameClock motionDebugLogSchema motionDebugRecorder`
- `npm run build`
- `npm run check`
- `npm run test`
- `npm run tasks:check`
    - 初回は worktree root に `yaml` dependency が無く失敗した。main checkout の root `node_modules` へ一時 symlink を置いて再実行し PASS。symlink は削除済み。
- `npm run gate`
    - commit `ffc658b15bcecf8943f9e9b6c25b7e27367be89d`、clean worktree で lint / build / test PASS。

### 未実行 / 残リスク

- 手動または Playwright の `motion-debug` recording は未実行。サブエージェント worktree では実カメラ権限フローを確認していないため。rVFC / fallback clock、schema 互換、timestamp 保存、`presentedFrames` dedupe は unit test で代替した。
- Vite build の既存 chunk size warning は継続して出るが、本タスクの変更による failure ではない。
