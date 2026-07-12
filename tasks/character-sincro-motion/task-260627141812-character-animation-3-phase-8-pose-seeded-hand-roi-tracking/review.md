# Review: task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking

## 判定

APPROVED

`task.md:114` の Worker 実行順序説明は current HEAD とずれているが、受け入れ条件は Hand を Pose snapshot 後に実行する前提で一意に読める。Critical / High の blocking 指摘はなく、stale 前提は実装者への申し送りで吸収可能。

## 指摘事項

（深刻度順: Critical > High > Medium > Low）

- [Medium] `task.md:114` は「Worker は現在 Face -> Pose の順に実行」としているが、current HEAD の `sincromisor-frontend/src/features/gaze/trackingRuntime/sincroTracker.worker.ts:119-126` は Pose を先に実行し、その Pose snapshot を使って Face ROI / full-frame fallback を選ぶ順序になっている。これは既存コード整合の stale 記述だが、同じ箇条書き内で「Hand は Pose 後に実行」と明記され、完了条件 `task.md:69-78` も Pose-seeded ROI / `handEnabled` / cadence / fallback を具体化しているため、成果物やテスト期待値は破綻しない。

## 実装者への申し送り

- Worker / main-thread runtime へ Hand を足す際は、古い Face -> Pose 前提ではなく、現行の Pose -> Face ROI 経路へ合わせること。具体的には Pose が実行された frame で Pose snapshot を得た後、Face ROI と同じ Pose snapshot を使って Hand ROI を作り、Hand は Pose 後に差し込む。
- ROI contract は current HEAD で成立している。`createHandRoiFromPoseArm()` は `sincromisor-frontend/src/features/gaze/trackingRuntime/roiTracking/roiCoordinateMapping.ts:29-33`、`mapCropPointToFullFrame()` は同 `:197-201`、`SincroRoiObservation` は `roiTrackingTypes.ts:29-36` を正本として使う。
- Hand model asset `sincromisor-frontend/public/3rd_party/hand_landmarker.task` は存在するため、新規取得や network fetch は不要。
- `handEnabled = true` でも `poseEnabled = false` の場合は、task.md の指定どおり Worker 側で Hand を実行せず stopped/lost hand snapshot を返す。Hand の失敗や Worker unavailable が Face / Pose 経路を停止させないことを維持する。
- ドキュメント同期は受け入れ条件に含まれている。`documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` に Hand snapshot、feature 値域、ROI fallback、Hand wrist を IK 主 target にしない境界、Gesture を Phase 9 に残す方針を反映すること。
