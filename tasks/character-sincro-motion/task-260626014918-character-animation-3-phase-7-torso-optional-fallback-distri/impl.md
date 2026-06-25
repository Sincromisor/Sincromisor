# Implementation Log: task-260626014918-character-animation-3-phase-7-torso-optional-fallback-distri

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### 変更内容

- 実装コミット: `c5d9356 feat(character): add torso fallback pose distribution`
- `AvatarMotionProfile.torso.distribution` を正本にする torso fallback helper を追加した。
- composer の owned bone policy に `spine` / `chest` / `upperChest` を追加し、欠損 `upperChest` は既存の `missing_optional_bone` suppression に乗せた。
- 3 構成の分配、invalid distribution fallback、missing optional torso suppression、ownedBones ordering のテストを追加した。
- `documents/design/frontend/character/motion.md` に torso distribution、helper の fallback policy、本番 `CharacterMotionTorsoApplier` 置き換えと `setNormalizedPose(finalPose)` 全面移行を後続に残す判断を同期した。

### 判断 / review.md 申し送りへの対応

- `VrmPoseLayerKind` の `"tracking"` は既存 kind をそのまま利用し、新しい layer kind は追加しなかった。
- invalid distribution は negative / non finite / sum error をすべて `invalid_torso_distribution_profile_defaulted` の 1 code に集約した。
- `createTorsoFallbackLayer()` は存在する torso bone だけを `ownedBones` に含めるため、helper 由来の layer は欠損 bone を直接出力しない。composer 側の optional suppression は、外部 layer が欠損 `upperChest` を所有した場合にも throw せず記録できるようにした。
- 本番 `CharacterMotionTorsoApplier` と `vrm.humanoid.setNormalizedPose(finalPose)` の全面移行はタスク範囲外として未実施。

### 確認結果

- `cd sincromisor-frontend && npm run test -- vrmPoseTorsoFallback`: PASS
- `cd sincromisor-frontend && npm run test -- vrmPoseComposer`: PASS
- `cd sincromisor-frontend && npm run check`: PASS
- `cd sincromisor-frontend && npm run build`: PASS
- `npm run gate`: PASS (`c5d9356`, lint / build / test)

### 未実行確認

- ブラウザ上の motion-debug / 実 VRM 表示確認は未実行。本タスクは pure helper / composer policy / unit test / design doc の追加で、本番 torso controller 置換を含まないため。

### 残リスク

- `composeVrmPose()` の profile は現時点で `MinimalAvatarMotionProfile` のため、composer 単体では `chest` 欠損 capability を判定できない。helper は完成版 `AvatarMotionProfile.capabilities.bones` を見て欠損 chest を出力しない設計にしている。
- 実運用の torso controller と final pose 一括適用の二重書き込み排除は後続タスクの責務として残る。
