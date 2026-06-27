# Review: task-260627141812-character-animation-3-phase-8-pose-seeded-hand-roi-tracking

## 判定
APPROVED

前回の blocking High は解消済み。Hand snapshot schema / feature 値域 / openness 境界、runtime 有効化と cadence、文書同期の受け入れ条件が task.md に明記され、改訂による新たな破綻も見当たらない。

## 指摘事項
なし

## 実装者への申し送り
- `SincroHandSideSnapshot.roi?: SincroRoiObservation` は依存タスク `task-260627141812-character-animation-3-phase-8-roi-contract-coordinate-mappin` の `roiTrackingTypes.ts` contract をそのまま import して使うこと。ROI warning enum を Hand warning enum に重複移植しない。
- Hand は `poseOptions.enabled === true` かつ `poseOptions.hand?.enabled === true` の場合だけ起動する方針。`onHandMotion` callback の有無だけで推論を始めない。
- Pose が未実行、または Worker 側で `handEnabled = true` / `poseEnabled = false` になった場合は、task.md の指定どおり stopped/lost hand snapshot を返し、Face / Pose 経路を止めない。
- 文書更新は受け入れ条件に入っているため、実装時は `documents/design/frontend/character/tracking.md` と `documents/design/frontend/character/motion.md` の同期を忘れないこと。
