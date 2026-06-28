# Review: task-260628200308-character-animation-3-0-phase-12-tracker-runtime-facade-spli

## 判定
APPROVED

High/Critical の blocking 指摘はない。公開 lifecycle API 維持、Worker / main-thread / degradation / ROI / stats の分割境界、fallback 挙動、design doc 同期が検証可能に書かれている。

## 指摘事項
- [Medium] 既存コード・設計文書の `file:line` にズレがある。`documents/design/frontend/character/tracking.md:42` は TrackerRuntime 責務ではなく、現状の TrackerRuntime 節は `documents/design/frontend/character/tracking.md:65` 以降。`trackerRuntime.ts:101` は start lifecycle ではなく private field 付近で、`startFaceTracking()` は現状 `trackerRuntime.ts:122` から始まる。対象箇所は特定できるため blocking ではない。

## 実装者への申し送り
- `SincroTrackerWorkerStats`、`budget`、`degradationPolicy`、`roi` の shape は developer-visible な debug / metrics 境界なので、型差分と snapshot 差分を出さない。
- `ignorePerformanceFallback` は face-only / comfortable-idle 抑制だけに留め、reduced fps と ROI pause stage を消さないことを `trackerRuntimeDegradationPolicy` / `trackerRuntimeRoiBudget` 系テストで確認する。
- helper module のために facade から private state を広く公開しない。必要な入力は責務名付きの domain-internal 型にまとめる。
