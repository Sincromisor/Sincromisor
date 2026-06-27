# Review: task-260627141813-character-animation-3-phase-8-roi-reliability-debug-replay

## 判定
APPROVED

前回再レビューの blocking 指摘 2 件は解消済み。ROI component の正本と ROI metadata 欠損時 reason が task.md 内で一貫し、今回の改訂による新たな破綻も確認されなかったため、実装に進ませてよい。

## 指摘事項
なし

## 実装者への申し送り
- Face reliability の ROI component は `face.roi.confidence` を正本にし、Face center consistency は Face task 側の fallback 判断に閉じる方針で確定している。
- Hand reliability の ROI component は `calculateRoiConsistency()` を正本にし、`referencePoint` または `fullFrameWrist` 欠損時は `not_available_in_pose_snapshot` に落とす方針で確定している。
- ROI reason は、snapshot 自体なしを `no_observation`、旧 snapshot / 旧 replay log の `roi` field 欠損を `not_available_in_pose_snapshot`、新規 ROI metadata の failure warning を `mapRoiWarnings()` による `roi_missing` / `roi_inconsistent` として扱う。
