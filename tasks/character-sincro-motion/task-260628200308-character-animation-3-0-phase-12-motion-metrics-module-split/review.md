# Review: task-260628200308-character-animation-3-0-phase-12-motion-metrics-module-split

## 判定

APPROVED

High/Critical の blocking 指摘はない。公開 API 維持、module 境界、順序・threshold・parser 失敗時挙動、テスト、設計文書同期が具体化されており、実装へ進めてよい。

## 指摘事項

- [Medium] `documents/rules/code-structure.md:17` を hard threshold として参照しているが、現状のファイル hard threshold は `documents/rules/code-structure.md:15`、行 17 は関数引数数の行。schema validation と純粋計算の分離は `documents/rules/code-structure.md:32` 以降にある。分割対象と目的は明確なので blocking ではない。

## 実装者への申し送り

- `motionMetrics.ts` 自体も変更ファイルとして structure guard の strict 対象になる。facade は 300 行以下に収めるか、task.md 指定の例外コメント理由を残す必要がある。
- `MotionMetricKey` / `MOTION_METRIC_KEYS` / `DEFAULT_MOTION_METRIC_THRESHOLDS` は順序と値の差分が出ないよう、移動後にテストだけでなくレビューでも確認する。
- 旧 replay log の欠損 field が従来どおり `not_available` / fallback になることを `motionMetrics` と `motionQaRegression` の既存テストで重点確認する。
