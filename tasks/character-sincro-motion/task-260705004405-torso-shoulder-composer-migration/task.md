# Migrate torso and shoulder composer ownership

## 背景 / 目的

arm composer application の hardening 後、full final pose へ進む前に torso / shoulder の所有権を
`CharacterMotionTorsoApplier` / direct controller から composer layer へ段階移行する必要がある。

本タスクでは torso / shoulder だけを composer 所有に移し、head / neck / leg / expression と finger は
既存 controller 所有のまま残す。

## 完了条件（受け入れ条件）

- [ ] `CharacterMotionTorsoApplier` 由来の spine / chest / upperChest / shoulder 書き込みを、migration plan の
      `move-to-composer` 対象だけ composer layer へ移す。
- [ ] migration plan の `keep-controller-owned` と `needs-decision` は本タスクで移行しない。移行しない bone は
      runtime ownership map と Debug Console summary で理由を確認できる。
- [ ] torso / shoulder composer layer は `AvatarMotionProfile.torso.distribution` と optional bone capability を正本にし、
      欠損 `upperChest` / shoulder bone で throw しない。
- [ ] shoulder 欠損時の fallback は upperArm 境界に閉じ、head / neck / leg / expression / finger を巻き込まない。
- [ ] torso / shoulder 用 feature flag を追加または既存設定 model に明示し、既定値は旧 direct controller 所有へ戻る
      safe default にする。Debug Console summary で mode / rollback reason を確認でき、flag off では
      `CharacterMotionTorsoApplier` 由来の direct write が再適用されること。
- [ ] torso / shoulder flag は arm flag と混ぜない。arm flag の mode 切替や rollback が torso / shoulder 所有者を
      暗黙に変えないことを test または replay artifact で確認する。
- [ ] `finalPoseOwnedBoneConflictCount` は pass で、torso と shoulder の所有者が同一 frame 内で競合しない。
- [ ] spine / chest / upperChest capability の異なる synthetic profile、missing shoulder synthetic profile、Face-only recovery で
      visual または replay 確認を行い、`artifacts/torso-shoulder-composer-migration-verification.md` に記録する。
- [ ] `documents/design/frontend/character/motion.md` と runtime ownership map artifact に、移行済み torso /
      shoulder ownership、fallback reason、rollback 条件、非対象 bone を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、
      `symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、
      `action`、`reviewer note` に固定し、最低限 torso layer 生成 export、shoulder fallback decision、
      `CharacterMotionTorsoApplier` 側の削除/残置判断、runtime ownership map 更新判断、optional bone fallback、
      head / neck / leg / expression 非対象判断を含める。
      audit 記録だけでは完了扱いにせず、public export / boundary / lifecycle / heuristic に必要な JSDoc/TSDoc の
      追加・更新または省略理由、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を
      実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- 移行対象は `torso-shoulder-composer-migration-plan` の `move-to-composer` だけに固定する。
  実装時に plan の分類を変える場合は本タスク内で artifact と docs を同時更新する。
- torso / shoulder layer は `VrmPoseComposer` の layer として生成する。`VRMCharacterManager.update()` で
  normalized bone node を直接追加書き込みする案は二重所有を残すため採用しない。
- full `setNormalizedPose(finalPose)` はまだ呼ばない。適用は torso / shoulder の direct write 置換に限定する。
- torso / shoulder 用 feature flag は本タスクの production 切替境界として必須にする。設定の所在は既存 runtime config /
  Debug Console summary の近傍に寄せ、既定値は旧 direct controller 所有へ戻る safe default にする。
- rollback は flag off で直前の controller-owned torso / shoulder 経路へ戻す。scope は torso / shoulder に限定し、
  arm flag と混ぜない。

## スコープ境界

- 本タスクでやること: torso / shoulder ownership migration、optional bone fallback、runtime ownership map / artifact 更新、
  docs sync、unit / replay verification。
- 本タスクでやらないこと: semantic / finger production 適用、full `setNormalizedPose(finalPose)`、head / neck / leg /
  expression の composer 所有化、WebRTC / backend 契約変更。
- 依存タスクとの境界: `task-260705004400-arm-composer-application-hardening` が arm flag exit criteria を満たす。
  `task-260629225951-torso-shoulder-composer-ownership-migration-plan` は移行分類を提供し、本タスクはその分類を実装へ移す。

## 実装方針（既存コード整合: file:line）

- Production Application Gates の torso / shoulder migration 条件は
  `documents/design/frontend/character/motion.md:469` が正本である。
- migration plan への導線は `documents/design/frontend/character/motion.md:217` にある。
- torso distribution / optional fallback の設計は `documents/design/frontend/character/motion.md:200` と
  `documents/design/frontend/character/motion.md:201` を読む。
- 現行 manager の更新順は `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:239` から
  `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:267` を維持し、二重書き込みを排除する。
- current ownership の正本は
  `tasks/character-sincro-motion/task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md`。
- optional bone fallback の既存検証は
  `tasks/character-sincro-motion/task-260629225957-composer-optional-bone-fallback-vrm-verification/artifacts/optional-bone-fallback-vrm-verification.md` を参照する。

## テスト

- `sincromisor-frontend/src/character/vrmPose/` または新規近傍テストで、spine/chest/upperChest 構成別の
  torso layer ownership、missing optional bone suppression、ownedBones conflict なしを検証する。
- `sincromisor-frontend/src/character/vrmCharacter/` 周辺テストで、旧 torso/shoulder direct write と composer write が
  同一 frame で二重適用されないことを検証する。
- motion metrics または replay fixture で `finalPoseOwnedBoneConflictCount`、`neutralJitter`、
  `temporalNeutralWristJitter`、`recoveryJumpAngleDeg` の regress がないことを確認する。
- `npm run gate` を通す。

## ドキュメント同期の要否

要。developer-visible な production ownership と rollback 条件が変わるため、
`documents/design/frontend/character/motion.md` と runtime ownership map artifact を同期する。
公開 WebRTC / backend 契約は変更しない。
