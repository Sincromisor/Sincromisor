# Evaluation: task-260625035438-character-animation-3-phase-4-downstream-weights

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `createMotionDebugCanonicalState()` / `createCanonicalUpperBodyState()` の optional `reliability?: ReliabilityMap` 追加と未指定時の既存挙動維持 — `motionDebugCanonicalState.ts:9-32`、`canonicalArmFeatureExtractor.ts:30-42`、`canonicalArmFeatureExtractor.test.ts` の `keeps old confidence when reliability is not provided` で確認。
- [✓] `extractCanonicalArmState()` の `poseConfidence * sqrt(partWeight * minJointWeight)` downweight — `canonicalArmFeatureExtractor.ts:207-242` で式を実装し、`resolveArmReliability()` が左右 arm の part weight と shoulder / elbow / wrist の最小 joint weight を解決している（同 `252-279`）。
- [✓] low reliability reason の canonical warnings 変換 — `canonicalArmFeatureExtractor.ts:282-312` が `components.*.reasonCodes` を読み、`side_inconsistent`、`bone_length_inconsistent`、`body_scale_jump` を指定 warning に写している。`ReliabilityWarningCode` 依存は見当たらない。
- [✓] lost / suspect arm の扱い — `part.state === "lost"` は confidence 0、source `neutral`（`canonicalArmFeatureExtractor.ts:236-242`, `125-140`）。suspect は lost 判定に入らず downweight された pose source として残る。実装者テストで lost / suspect の両方を確認。
- [✓] MotionDebugApp live / replay canonical 生成で valid reliability を渡し、invalid saved replay reliability は canonical へ渡さない — live は `updatePoseReliability()` 後に `recordPoseFrame()` へ `latestValidReliability()` を渡し、recording controller が canonical に渡す（`motionDebugApp.ts:584-594`, `motionDebugRecordingController.ts:114-134`）。replay は `updateReplayReliability()` を先に実行し、`latestValidReliability()` のみ canonical に渡すため parse error の reliability は canonical input にならない（`motionDebugApp.ts:597-640`）。
- [✓] `MotionDebugSnapshot.canonicalReliabilityInput` の最低項目 — `types.ts:109-130` と `createMotionDebugCanonicalReliabilityInput()` に `schemaVersion`、`mediaTimeMs`、左右 arm の `partWeight` / `minJointWeight` がある（`motionDebugCanonicalState.ts:35-60`）。
- [✓] retarget / IK / CharacterBehaviorState / SincroPoseRetargeter / ikWeight が変更されていないこと — 差分ファイルは canonical / motion-debug / tests / docs に限定。`git diff HEAD^ HEAD --name-only` に retarget / IK / CharacterBehaviorState / `sincroPoseRetargeter` / snapshot contract 変更は無い。
- [✓] ユニットテスト — `canonicalArmFeatureExtractor.test.ts` に未指定、高 reliability、suspect、lost、reasonCodes warning 変換のケースが追加されている。`motionDebugCanonicalState.test.ts` は `canonicalReliabilityInput` の投影と undefined ケースを確認している。
- [✓] docs 同期 — `documents/design/frontend/character/motion.md` に Phase 4 の canonical confidence downweight、lost / suspect、reasonCodes warning 変換、`canonicalReliabilityInput`、retarget / IK は Phase 5 / 6 以降であることが追記されている。

## テスト結果

- `npm run gate`（評価用 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-5d53d377c60b-IDFYhm`、commit `5d53d377c60bfdaa0d3eec8195f7764291e91d63`、clean）: PASS
- gate details:
    - `gate:lint`: CACHE HIT / PASS
    - `gate:build`: CACHE HIT / PASS
    - `gate:test`: CACHE HIT / PASS, 133 tests passed
- 追加 acceptance test: 不要と判断し未作成。実装者テストと差分レビューで受け入れ条件を十分に確認できる。
- カバレッジ評価: canonical downweight、reasonCodes warning、lost / suspect、reliability 未指定互換、debug snapshot projection はユニットテストで直接確認されており十分。MotionDebugApp のブラウザ実機操作は未実施だが、今回の受け入れ条件は state 生成と window API snapshot の責務であり gate と静的追跡で判定可能。

## ドキュメント整合性

- 公開 WebRTC / backend 契約変更: なし。
- developer-visible な motion-debug / canonical snapshot 挙動変更: あり。
- 同期状況: 同期済み。`documents/design/frontend/character/motion.md` に Phase 4 downstream 接続範囲、downweight 式、lost / suspect の扱い、reasonCodes 変換、retarget / IK 未接続が記載されている。

## 残課題（FAIL の場合）

- なし。
