# Evaluation: task-260629225942-production-retarget-composer-motion-metrics-comparison

## 判定

PASS

attempt 2 で前回 FAIL 点は解消された。`parseComposerDryRunFromFrame()` は status 付き
`SincroVrmPoseComposerDryRunResult` だけを受理し、legacy
`frame.finalPose.schemaVersion = "sincro.vrm-pose-composer-result.v1"` snapshot は
`composerDryRun: undefined` として扱う。旧 log / dry-run 欠損は
`retarget_or_composer_not_recorded` / `not_available` / warn 以上へ落ちる。

## 受け入れ条件チェックリスト

- [✓] metric helper 追加と 5 metric key 固定 — `motionComposerComparisonMetrics.ts` に
  `calculateComposerComparisonMetrics(input)` と
  `composerAngleDeltaDeg`、`composerAngularVelocitySpike`、`composerOwnedBoneConflictCount`、
  `composerSuppressionCount`、`composerMissingPoseFrameCount` の固定 key がある。
- [✓] export / facade re-export — `ComposerComparisonMetricFrameInput`、
  `ComposerComparisonMetricFrameResult`、helper / summary API は module から export され、
  `motionMetrics.ts` facade からも re-export されている。
- [✓] input plain object 境界 — `ComposerComparisonMetricFrameInput` は
  `{ mediaTimeMs; retarget?; composerDryRun? }` に固定され、VRM Object3D / `THREE.Quaternion` instance を
  型境界に含まない。parser schema も plain object を要求する。
- [✓] retarget parser slot — `parsePoseRetargetRuntime()` は `frame.solver.poseRetargetRuntime` だけを読み、
  旧 `frame.solver.poseRetarget` は fallback source にしない。
- [✓] `poseRetargetRuntime` 欠損 / invalid — fallback 再計算せず retarget `undefined` とし、
  frame metric では `composerMissingPoseFrameCount: 1` へ落ちる。
- [✓] `NEUTRAL_POSE_FRAME` 補完範囲 — parser は `active`、`confidence`、`ikMode`、
  `fallbackReason`、`solverProbe`、`anchor`、`leftArm`、`rightArm` だけを上書きし、補完した
  `upperBody` は angle delta 対象外。
- [✓] 5 metric の値定義 / 集計 / unit / direction / threshold — angle delta p95、angular velocity
  unique bone 合計、owned conflict unique warning 合計、suppression 合計、missing frame 合計が task 指定と一致。
- [✓] dry-run 欠損 / legacy finalPose snapshot — `parseComposerDryRunFromFrame()` は
  `dryRunResultSchema.safeParse(frame.finalPose)` の成功時だけ dry-run を返し、legacy
  `sincro.vrm-pose-composer-result.v1` を available に昇格しない。test
  `does not treat legacy finalPose snapshots as production dry-run results` で
  `comparison_unavailable` / `retarget_or_composer_not_recorded` / `not_available` / warn を確認している。
- [✓] unavailable / not-captured を pass 扱いしない — unavailable summary は summary severity と各 metric
  severity が warn、metric status が `not_available`。
- [✓] summary schema / fields / inputs — schema は `sincro.composer-comparison-summary.v1`、required fields と
  inputs の baseline manifest path / replay log 有無 / composer dry-run result 有無を保持する。
- [✓] 6 fixture not-captured artifact — 独立検証で 6 件すべて `comparison_unavailable` / warn /
  `baseline_not_captured`、5 metric すべて `not_available` / warn / `baseline_not_captured` / `value: null`。
- [✓] feature flag 合否を自動決定しない — comparison は metric / artifact / Debug Console 判断材料に留まり、
  composer 実適用の自動判定は追加していない。
- [✓] design doc 同期 — `documents/design/frontend/character/motion.md` に schema、metric key、threshold、
  parser 方針、legacy finalPose snapshot を dry-run result へ昇格しないこと、unavailable を pass にしないこと、
  feature flag 判断材料であることが同期されている。
- [✓] comment audit — `impl.md` に attempt 1 の audit table と attempt 2 の差分 audit があり、parser /
  fallback / design doc / regression test の変更理由と maintenance knowledge が記録されている。

## テスト結果

- `git status --short`（評価 worktree）: clean。
- `npm run gate`（評価 worktree
  `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-871f85a3be73-yRSQHB`）: PASS。
  `gate:lint` / `gate:build` / `gate:test` は cache hit。test summary は 428 passed。
- artifact 独立検証:
  `production-composer-comparison-summaries.not-captured.json` を Node で検査し、6 fixture と全 metric の
  `not_available` / warn 以上 / `baseline_not_captured` を確認。
- カバレッジ評価:
  metric 値、summary 集計、old `poseRetarget` 非 fallback、status 付き dry-run result の受理、
  legacy finalPose snapshot の拒否、captured 全欠損 unavailable、not-captured unavailable が unit test で確認されている。
  task の受け入れ条件に対して十分。

## ドキュメント整合性

- 公開 API endpoint / WebRTC 契約 / compose / env の変更はなし。
- Developer-visible artifact schema と metric contract は `documents/design/frontend/character/motion.md` に同期済み。
- attempt 2 の legacy finalPose snapshot 非昇格方針も design doc と `impl.md` の audit に同期済み。

## 残課題（FAIL の場合）

- なし。
