# Review: task-260628200308-character-animation-3-0-phase-12-motion-intent-estimator-spl

## 判定

APPROVED

High/Critical の blocking 指摘はない。公開 class / factory / export type 維持、module 分割先、保存 contract 維持、コメント方針、design doc 同期まで受け入れ条件が一意に定義されている。

## 指摘事項

- [Medium] `documents/rules/code-structure.md:17` を hard threshold として参照しているが、現状のファイル hard threshold は `documents/rules/code-structure.md:15`。目的と対象ファイルは明確なので blocking ではないが、現行行番号で裏取りすること。

## 実装者への申し送り

- `MOTION_INTENT_SCHEMA_VERSION` と `parseMotionIntentState()` は `motionIntentState.ts` 側の保存 contract なので、estimator 分割中に import / re-export の整理だけで schema 変更を混ぜない。
- facade から re-export する公開型と、責務 module 内に閉じる domain-internal helper を分ける。テスト都合だけの facade export は task.md の禁止事項どおり避ける。
- `semantic hold`、`sideSwapHoldMs`、wave alternation は回帰しやすいので、既存 `motionIntentEstimator` テストで warning code と stable duration を重点確認する。
