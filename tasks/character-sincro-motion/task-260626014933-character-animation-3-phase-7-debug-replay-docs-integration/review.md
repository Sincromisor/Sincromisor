# Review: task-260626014933-character-animation-3-phase-7-debug-replay-docs-integration

## 判定

APPROVED

前回 blocking だった solver layer の戻り値/status 集約と live Phase 7 snapshot の接続元は、task.md の受け入れ条件と設計判断で一意に固定された。改訂箇所に起因する新たな破綻は確認できない。

## 指摘事項

なし

## 実装者への申し送り

- `viewer.layers.solver.value` は `{ phase6, phase7 }` の substatus 付き object に固定されている。外側 `viewer.layers.solver.status` は両方 `not_recorded` のときだけ `not_recorded`、片方でも `available` または `invalid` なら `available` とする。
- live Phase 7 snapshot は `DebugConsoleSnapshot` に calibration state を直接追加せず、`MotionDebugRecordingController` params の `getInitialCalibrationSession()` / `getOnlineCalibrationState()` と `latestCanonical?.calibration` から組み立てる方針に従う。
- 既存の `SincroMotionDebugFrame.solver` は unknown optional slot なので、recording/manifest 側は `phase7` を unknown object として許容し、厳密検証は Phase 7 layer parser に閉じる。
- 依存 task の成果物である `AvatarMotionProfile`、initial calibration、online calibration state、canonical calibration snapshot の clone/parser contract を使い、runtime object を debug log に保存しない。
- docs 同期は受け入れ条件どおり `documents/design/frontend/character/motion.md`、`documents/design/frontend/character/tracking.md`、`documents/design/frontend/character/overview.md` を対象にする。
