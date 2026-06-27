# Review: task-260627234129-character-animation-3-0-phase-10-degradation-metrics

## 判定
APPROVED

Critical / High の blocking 指摘はない。追加 metric key、閾値、計算入力、旧 log / baseline 欠損時の扱い、viewer / test / document 同期先が受け入れ条件として一意に書かれており、公開挙動に対する文書同期も task.md に含まれている。

## 指摘事項
- なし

## 実装者への申し送り
- `task-260627234128-character-animation-3-0-phase-10-ordered-degradation-policy` が `SincroTrackerWorkerStats.degradationPolicy` を追加する前提のタスクなので、実装着手は依存タスクの成果物に合わせること。依存が未完了なら `degradationPolicy` schema は task.md の依存境界どおり扱い、本タスク側で policy 実装まで広げない。
- `trackerDroppedFrameCount` は `frame.timestamp.droppedPresentedFrames` が保存時点の per-frame drop 数、`frame.metrics.tracker.droppedFrames` が worker stats の累積値である点に注意する。比較前に tracker 側を frame 間差分へ正規化し、同一 frame では両 source の大きい値だけを採用して二重計上を避ける。
- budget / roi / degradationPolicy の optional field が欠損または invalid な旧 log では、既存 `NumericMetricComputation` / `not_available` の流儀に合わせ、欠損を 0 として pass 扱いにしないこと。mixed log の sampleCount / unavailableReason は既存 metric の表示と baseline 補完の挙動に揃える。
- 現行 `documents/design/frontend/character/motion.md` には budget overrun の metric 化を「別タスク」とする記述が残っているため、受け入れ条件どおり Phase 10 metric 化後の正本へ更新すること。
