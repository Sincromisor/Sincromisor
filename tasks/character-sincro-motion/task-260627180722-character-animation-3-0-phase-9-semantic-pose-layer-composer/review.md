# Review: task-260627180722-character-animation-3-0-phase-9-semantic-pose-layer-composer

## 判定

APPROVED

前回の blocking 指摘だった `semantic_conflict` 用 confidence 伝達、helper / debug snapshot の return contract、全 intent の preset mapping / no-op 方針はいずれも task.md に追記され、実装者の裁量で成果物が変わる状態は解消されています。改訂範囲に新たな Critical / High の破綻は見つかりません。

## 指摘事項

- [Low] `VrmPoseLayer.metadata.semantic.conflictSuppressionThreshold` は型例に含まれていますが、task.md は同時に「v1 では semantic confidence だけを composer が読む」「intent confidence `< 0.65` の場合に suppress」と固定しています。実装時は composer 判定を固定値 `0.65` に揃え、threshold field を将来拡張用に読む扱いへ広げないでください。

## 実装者への申し送り

- `createSemanticMotionPoseLayer()` は `SemanticMotionPoseLayerResult` 型も snippet 上で export されているため、実装でも export してください。
- no-op intent でも `layers: []` と valid debug snapshot を返す方針が明確化されています。`tracking`、`guarded`、片側だけの `clapLike` はこの期待値に合わせてください。
- `clapLike` の both layer は左右単独 layer より優先し、metadata の `intentConfidence` は左右 confidence の小さい方を使う指定です。
- docs 同期は完了条件に追加済みです。`documents/design/frontend/character/motion.md` と `documents/design/frontend/character/overview.md` を実装と同じタスク内で更新してください。
