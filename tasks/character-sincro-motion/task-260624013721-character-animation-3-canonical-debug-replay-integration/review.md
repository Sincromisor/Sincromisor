# Review: task-260624013721-character-animation-3-canonical-debug-replay-integration

## 判定
APPROVED

Blocking になる Critical / High はない。`frame.canonical` 保存、window snapshot、viewer fallback、invalid parse 表示、文書同期が受け入れ条件に明記されており、現行 `motion-debug` / recorder / replay の責務境界とも整合している。

## 指摘事項
（深刻度順: Critical > High > Medium > Low）

- [Medium] `MotionDebugSnapshot.canonical` の型が、受け入れ条件では `CanonicalUpperBodyState` と書かれている一方、最小 integration shape では `CanonicalUpperBodyState | CanonicalLayerParseError` になっている（`task.md:13`, `task.md:33-45`）。判定を止めるほどではないが、公開 window API の型なので、実装時は `CanonicalLayerParseError` を `snapshot.canonical` に載せるのか、`viewer.layers.canonical.value` のみに閉じるのかを task.md の設計判断どおりに一貫させること。
- [Low] `CanonicalLayerParseError.errors` が参照する `CanonicalUpperBodyStateParseError` は、依存元の canonical contract task では明示 export 条件になっていない。依存実装で export されていない場合は、parse API の戻り値型から導出するか、このタスク内で viewer 用 summary 型へ変換すること。

## 実装者への申し送り

- 現行リポジトリでは `src/character/canonical/` はまだ存在しない。`meta.yaml` 上の直接依存 `task-260624013718-character-animation-3-canonical-arm-feature-extraction`、およびその推移依存の torso / contract タスクが完了してから着手する前提でよい。
- `MotionDebugRecordingController.recordPoseFrame()` は現在 `poseSnapshot`、`solver`、`metrics` を `MotionDebugRecorder.recordFrame()` に渡しているため、同じ frame input に `canonical` を追加する方針は現行コードと合っている。
- `motionDebugViewerModel` は現状 `context.replayFrame?.canonical` のみを canonical layer source にしている。実装時は task.md どおり replay frame の saved canonical を優先し、なければ live snapshot canonical へ fallback すること。
- invalid canonical は replay failure にしない方針が確定している。layer status union は増やさず、`available` + parse error summary として表示する。
- developer 向け debug log と `window.__SINCRO_MOTION_DEBUG__.getSnapshot()` の公開挙動が変わるため、`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/tracking.md` の同期は受け入れ条件として必ず満たすこと。
