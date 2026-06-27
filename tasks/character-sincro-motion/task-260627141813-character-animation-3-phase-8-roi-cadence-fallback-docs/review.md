# Review: task-260627141813-character-animation-3-phase-8-roi-cadence-fallback-docs

## 判定
APPROVED

前回の blocking High は解消済み。依存成果物、ROI stats / budget の最小 schema、ROI over-budget degradation の state machine が `task.md` 単体で確定し、改訂で新たに実装を止める破綻は見当たらない。

## 指摘事項
- なし

## 実装者への申し送り
- 依存未充足時は `task.md:11` の通り実装を進めずに停止すること。特に `SincroHandMotionSnapshot`、`TrackerRuntimePoseOptions.hand`、`SincroTrackerWorkerResultMessage.hand`、`SincroTrackerWorkerStats.effectiveHandFps`、`SincroFaceMotionSnapshot.roi/source/warnings` が HEAD に存在することを先に確認する。
- `SincroTrackerRoiStats` は `task.md:16-37` の schema を正本にし、累積値は tracker runtime start 以降、`stopFaceTracking()` / restart で reset する前提を崩さない。
- `SincroHandWarningCode` 側に `hand_roi_paused` が無い場合でも、`task.md:43` の指定どおり pause は top-level `fallbackReason` と ROI stats reason code で表現し、前段 Hand snapshot schema を不用意に広げない。
- budget report の `target` / `observed` shape は変更せず、ROI 詳細は `SincroTrackerWorkerStats.roi` に閉じる方針を守る。
