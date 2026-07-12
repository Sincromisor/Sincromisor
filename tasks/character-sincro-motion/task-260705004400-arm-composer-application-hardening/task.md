# Harden composer arm production application

## 背景 / 目的

`composerArmApplicationMode` は実装済みだが、Production Application Gates の arm application flag
段階では、片腕/両腕 mode 切替、dry-run unavailable、対象外 bone 非変更、Debug Console warning、
rollback 条件を本番 rollout 前に固める必要がある。

本タスクでは arm flag を production 適用の最初の実験段階として hardening する。torso / shoulder /
finger / head / expression はまだ composer 所有に移さない。

## 完了条件（受け入れ条件）

- [ ] `composerArmApplicationMode` の `"off"` / `"left"` / `"right"` / `"both"` で、対象腕の
      `upperArm` / `lowerArm` / `hand` だけが direct write 後に composer `finalPose` で上書きされる。
- [ ] mode `"off"` と対象外腕では direct write が必ず再適用され、dry-run result の availability 確認や
      fallback warning 生成も行われない。
- [ ] `composerDryRun.status !== "available"`、`result` 欠損、対象 bone 欠損、normalized bone node 欠損の各
      fallback reason が Debug Console の composer dry-run warning へ出る。
- [ ] mode 切替 frame で production dry-run service の previous final pose が reset され、前 mode の
      final pose を angular velocity clamp の previous として持ち越さない。
- [ ] shoulder / torso / finger / head / expression は本 task の適用対象外であることを unit test と静的確認で
      固定する。`vrm.humanoid.setNormalizedPose()` は呼ばない。
- [ ] tracking 側の Hand ROI は腕 IK target の主入力にしない。腕 target は引き続き
      `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` を正本にする。
- [ ] arm flag verification artifact を `artifacts/arm-composer-application-hardening.md` に残し、各 mode、
      weak wrist / elbow、missing shoulder synthetic profile、rollback 条件、未実施の実機確認を記録する。
- [ ] `documents/design/frontend/character/motion.md` の arm application flag 節または近傍に、fallback reason、
      対象 bone、mode 切替 reset、未所有 bone を同期する。
- [ ] TypeScript production comment audit を `impl.md` に記録する。列は `path`、
      `symbol or decision`、`kind`、`current comment`、`decision`、`required maintenance knowledge`、
      `action`、`reviewer note` に固定し、最低限 `ComposerArmApplicationInput`、
      `ArmBoneController.update()`、`applyComposerArmApplication()`、`VRMCharacterManager.setSincroPoseRetargetConfig()`、
      `composerArmApplicationMode` config、Debug Console warning 連結判断、`setNormalizedPose()` 非使用判断を含める。
      audit 記録だけでは完了扱いにせず、public export / boundary / lifecycle / heuristic に必要な JSDoc/TSDoc の
      追加・更新または省略理由、弱い既存コメントの rewrite / delete、stale comment 更新・削除、TODO 必須情報の充足を
      実コードと `impl.md` で確認できること。

## 設計判断（着手前に確定済み）

- 適用場所は `ArmBoneController` の direct write 後に固定する。`VRMCharacterManager.update()` で
  `setNormalizedPose(finalPose)` を呼ぶ案は、torso / shoulder 以降の gate を飛ばすため採用しない。
- flag は既存 `SincroPoseRetargetConfig.composerArmApplicationMode` を使う。新しい env var / URL query /
  persisted setting は追加しない。
- fallback は「composer が使えないなら direct write のまま残す」だけにする。neutral pose を別途適用する案は、
  mode off / 対象外腕の見た目を変えるため採用しない。
- warning は Debug Console の composer dry-run summary へ合流する。別 panel / DataChannel / backend API は追加しない。

## スコープ境界

- 本タスクでやること: arm flag の fallback hardening、mode 切替 lifecycle、対象 bone 限定のテスト、
  verification artifact、docs sync。
- 本タスクでやらないこと: torso / shoulder composer migration、semantic / finger layer の production 適用、
  full `setNormalizedPose(finalPose)`、public WebRTC / backend 契約変更、永続設定 UI。
- 依存タスクとの境界: `task-260629225946-feature-flag-composer-arm-application` は flag の初期実装を提供する。
  本タスクは Production Application Gates の arm application flag exit criteria を満たすための hardening と
  検証を担う。

## 実装方針（既存コード整合: file:line）

- Production Application Gates の arm flag 条件は `documents/design/frontend/character/motion.md:468` が正本である。
- tracking layer の Hand ROI gate 影響は `documents/design/frontend/character/tracking.md:305` を読む。
- `composerArmApplicationMode` の契約と既定 `"off"` は
  `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:76` と
  `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts:106` にある。
- arm direct write 後の composer 適用境界は
  `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:20` と
  `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts:48` を維持する。
- manager 側は dry-run result を `ArmBoneController.update()` へ渡し、warning を state / Debug Console に戻す
  `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:234` と
  `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:243` を確認する。
- mode 切替 reset は `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts:302` を起点にする。

## テスト

- `sincromisor-frontend/src/character/vrmCharacter/__tests__/armBoneController.test.ts` を拡張し、対象腕限定、
  対象外腕非変更、unavailable fallback、missing bone fallback、mode off warning なしを検証する。
- `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager` 周辺の既存テストまたは新規テストで、
  mode 切替時に dry-run reset が呼ばれることを検証する。
- `npm run gate` を通す。

## ドキュメント同期の要否

要。developer-visible な production arm application flag の挙動を固めるため、
`documents/design/frontend/character/motion.md` の arm application flag 節または近傍に、fallback reason、
対象 bone、mode 切替 reset、未所有 bone を同期する。通信契約と backend API は変更しない。
