# Evaluation: task-260626014918-character-animation-3-phase-7-torso-optional-fallback-distri

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `vrmPoseTorsoFallback.ts` を追加し、`createTorsoFallbackLayer(input)` と `resolveTorsoDistribution(profile)` を export — `c5d9356` の新規ファイルで確認。
- [✓] `resolveTorsoDistribution(profile)` は `profile.torso.distribution` を正本にし、invalid 時に capability default と warning code を返す — `vrmPoseTorsoFallback.ts:37-49`, `:79-99`。negative / non finite / sum error は同じ `invalid_torso_distribution_profile_defaulted` に集約されている。
- [✓] 既定分配は `0.25/0.40/0.35`, `0.35/0.65/0`, `1/0/0` に固定 — `vrmPoseTorsoFallback.ts:91-99`、既存 `AvatarMotionProfile` 生成側も同値（`avatarMotionProfile.ts:464-474`）。
- [✓] `createTorsoFallbackLayer()` は torso delta quaternion を分配 weight で damp し、存在する bone だけを `ownedBones` / pose に含める — `vrmPoseTorsoFallback.ts:52-76`。`capabilities.bones` が false の `chest` / `upperChest` は出力されない。
- [✓] `tracking` kind を新設せず既存 kind を使い、composer order は `fallback -> tracking -> idle -> style` のまま — `vrmPoseTypes.ts` に kind 追加なし、`vrmPoseComposer.ts:28`。
- [✓] `composeVrmPose()` は torso bone (`spine` / `chest` / `upperChest`) を supported owned bone として扱う — `vrmPoseBonePolicy.ts:22`, `:42-48`。head / neck / leg / expression の追加はなし。
- [✓] missing torso optional bone は `missing_optional_bone` として抑制され、throw しない — `upperChest` は optional capability に接続され、`vrmPoseComposer.ts:126-130` で抑制。テスト `lets composer suppress missing optional torso bones without throwing` で確認。
- [✓] `vrmPoseTorsoFallback.test.ts` を追加し、3 構成、invalid fallback、missing optional suppression、ownedBones ordering を検証 — `vrmPoseTorsoFallback.test.ts` 6 tests。
- [✓] `documents/design/frontend/character/motion.md` に Phase 7 torso fallback distribution と本番 `CharacterMotionTorsoApplier` 未置換判断を同期 — `motion.md:101-105`。

## テスト結果

- `npm run gate`（評価 worktree `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-c5d9356fcdbb-eCVgHU`, commit `c5d9356`, clean）: PASS
    - `gate:lint`: CACHE HIT / PASS
    - `gate:build`: CACHE HIT / PASS
    - `gate:test`: CACHE HIT / PASS（219 passed）
- 追加確認: `cd sincromisor-frontend && npm run test -- vrmPoseTorsoFallback`: PASS（1 file, 6 tests）
- カバレッジ評価: unit test は要求された helper 分配 3 構成、invalid fallback、composer missing optional suppression、ownedBones ordering を直接カバーしている。non finite / sum error は個別 test 名では分かれていないが、実装の単一 predicate で negative と同じ warning code に落ちることを静的確認済みで、受け入れ条件に対して十分。

## ドキュメント整合性

- 公開 WebRTC / backend API / DataChannel 契約の変更はなし。
- developer-visible な VRM pose fallback policy は変更あり。`documents/design/frontend/character/motion.md` に torso distribution、warning code、存在 bone のみ出力、`CharacterMotionTorsoApplier` 置き換えを後続に残す判断が同期済み。

## 残課題（FAIL の場合）

- なし。

## 補足判断

- 実装者の残リスク「composer 入力はまだ `MinimalAvatarMotionProfile` なので composer 単体では chest 欠損 capability を判定できない」は、本タスクの受け入れ条件違反ではないと判断した。新規 helper は完成版 `AvatarMotionProfile.capabilities.bones` を直接見て、欠損 `chest` / `upperChest` を pose / `ownedBones` に出力しない。composer は現行 minimal contract 上で判定可能な `upperChest` を `missing_optional_bone` として抑制でき、外部 layer が欠損 `chest` を所有するケースの追加 capability 拡張は後続の profile/composer 統合範囲で扱える。
