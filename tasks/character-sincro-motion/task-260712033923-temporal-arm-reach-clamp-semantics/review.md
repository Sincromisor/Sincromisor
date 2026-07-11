# Review: task-260712033923-temporal-arm-reach-clamp-semantics

## 判定

APPROVED

## Critical

- なし。

## High

- なし。

## 前回指摘の解消確認

1. unavailable literal / 混在 policy: 解消済み。
    - `unavailableReason: "reach_diagnostics_not_recorded"` が literal で固定された。
    - 全 arm-frame に finite `reach.excessReachRatio` がある場合だけ p95 を計算し、1件でも欠損・non-finite、または sample 0件なら部分 sample を使わず `not_available` とする方針が一意になった。

2. TypeScript production comment acceptance: 解消済み。
    - 弱い既存コメントの rewrite/delete、stale comment の更新/削除、コメント前の命名・関数分割・型・options object による自明化確認、変更した全 symbol/decision の評価時照合と不良コメントの FAIL 条件が受け入れ条件に追加された。

3. canonical fixture path / 同一 bytes: 解消済み。
    - canonical input が依存タスク配下の `artifacts/video/arms-cross.browser.mp4` に固定され、3 run で同一 bytes を使用し各 run の SHA-256 を保存する条件になった。
    - 別 container、再 encode、元 MOV への差し替えを同一比較として扱わない判断と、依存タスクが当該 artifact を提供する責務境界も明記された。

## 改訂による新規破綻の確認

- 前回指摘への追記は既存の Phase 6 optional schema、旧 log parse 方針、bridge / solver clamp ownership、実写3 run gate、依存タスクとの責務境界と整合している。
- repository-relative `file:line` 参照も補正され、現行コードの対象箇所と一致する。
- APPROVED を妨げる新たな矛盾・未確定事項は認めない。

## 実装者への申し送り

- p95 calculator は一部 frame だけを黙って採用せず、欠損を1件検出した時点で固定 reason の `not_available` にする contract を unit test で保持すること。
- 実写 artifact には run ごとの入力 SHA-256 を残し、3件が完全一致することを評価時に照合すること。
- comment audit と評価は task.md に追加された全 symbol/decision 条件をそのまま適用すること。

## Freshness check (2026-07-12)

### 判定

FRESH

### 基準

- reviewed SHA: `84cb9fe6d162d0cd9a2cfb4d9de3a1b123a7e917`
- checked HEAD: `dcfc5b8273b8070f4ca2c45c6d783329b889d349`

### 確認結果

- 基準以降の変更は、依存タスクが temporal bridge 出力を production primary に接続し、pose-snapshot fallback と source 診断を追加したもの。対象タスクが前提とする `createTemporalArmIkInput()`、solver の clamp、Phase 6 v1 optional 拡張という実装境界は残っている。
- canonical input `artifacts/video/arms-cross.browser.mp4` は現行 HEAD に存在し、SHA-256 は `21296ea0fbd2f8655d4c20bbffe67541457ed04ddef9468eacb7fa172cd1cf54`。同一 bytes 3 run の前提を満たせる。
- `motionDebugPhase6Snapshot.ts` には arm 単位の optional `source` と旧 log normalization が追加されたが、task の optional `reach` を同じ arm snapshot に追加し schema version `sincro.phase6-solver.v1` を維持する方針とは競合しない。

### 実装者への追加申し送り

- task.md の file:line は基準以降の変更でずれているため、行番号ではなく symbol 名を基準にすること。特に Phase 6 arm serializer/parser は `serializeArmSolverSnapshot()`、`phase6ArmSolverSnapshotSchema`、`normalizePhase6ArmSolverSnapshot()` の3箇所を同期すること。
- production primary 接続後は `SincroPoseRetargetedArm.solverSource` / `temporalBridge` が診断値の受け渡し境界になっている。bridge clamp 前の requested ratio を失わず、solver 最終 target の applied ratio と clamp ownership をこの現行経路へ統合すること。
- 新しい `source.targetReachRatio` と task の `reach.requestedReachRatio` / `appliedReachRatio` の意味が重複・矛盾しないよう整理し、docs と viewer も現行 source contract を前提に更新すること。
