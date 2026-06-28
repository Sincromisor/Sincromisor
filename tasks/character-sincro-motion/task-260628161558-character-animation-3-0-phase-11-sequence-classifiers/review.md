# Review: task-260628161558-character-animation-3-0-phase-11-sequence-classifiers

## 判定

APPROVED

前回 High 指摘 2 点は解消済み。post-processing contract task は依存欄に明示され、`MotionSequenceWindowSnapshot.inputAvailability` と `MotionPostProcessingResult.inputAvailability` の変換も一意に固定されているため、実装を止める破綻はない。

## 指摘事項

なし。

## 実装者への申し送り

- `task-260628161547-character-animation-3-0-phase-11-post-processing-contract` が `MotionPostProcessingResult` / correction schema の定義元なので、本タスクは依存タスク完了後にその contract を import して使う前提で進める。
- sequence window の `inputAvailability` は `temporal` / `intent` / `reliability` / `hand` を保持し、post-processing result へ写すときは task.md 指定どおり `{ canonical: false; temporal; intent; reliability }` に変換する。`hand` は post-processing availability へ出さない。
- `sideSwapSuspectCount` の reliability 側判定は既存 `ReliabilityMap` の `warnings` および part / joint の `warnings` で確認できる。必要に応じて `components.side.reasonCodes` ではなく task.md の指定どおり warning code を読む。
