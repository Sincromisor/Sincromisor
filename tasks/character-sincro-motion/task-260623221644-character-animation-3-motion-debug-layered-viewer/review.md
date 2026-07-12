# Review: task-260623221644-character-animation-3-motion-debug-layered-viewer

## 判定

APPROVED

前回の blocking 指摘だった layer status 判定表と `MotionDebugSnapshot.viewer` の最小 schema が task.md に追加され、mode 遷移と metrics 入力元も固定された。改訂差分に実装を止める新たな破綻は見当たらない。

## 指摘事項

なし

## 実装者への申し送り

- layer status は `task.md` の判定表を正本にする。Phase 1 予約のみの layer と slot 欠落が重なる場合は、canonical / temporal / intent や未実装 serializer / composer 由来の欠落を `not_implemented`、実装済み source のログ欠落を `not_recorded` として扱うのが自然。
- `MotionDebugSnapshot.viewer` の最小 shape は固定済みだが、recording 表示の「scrubbed camera settings の有無」は `viewer.recording` の Pick だけでは明示されていない。実装時は manifest / camera layer から導出するか、既存最小 shape を壊さない optional field として補うこと。
- 依存タスク側でも `frame.poseSnapshot` は schema / recorder / replay の各 task.md に固定されている。minimal valid log fixture は `manifest + 2 frame` の plain NDJSON とし、metrics view は manifest の `metricSummary` ではなく `calculateReplayMetrics()` の `MotionMetricSummary` を入力にする。
- ドキュメント同期は引き続き必須。`documents/design/frontend/character/motion.md` と、該当がある場合の `documents/design/frontend/pages.md` に viewer mode、layer selector、window API snapshot 拡張を反映すること。
