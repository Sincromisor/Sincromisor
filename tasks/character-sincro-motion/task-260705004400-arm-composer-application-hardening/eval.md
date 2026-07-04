# Evaluation: task-260705004400-arm-composer-application-hardening

## 判定

PASS

## 受け入れ条件チェックリスト

- [✓] `composerArmApplicationMode` の `"off"` / `"left"` / `"right"` / `"both"` で対象腕の
      `upperArm` / `lowerArm` / `hand` だけが direct write 後に composer `finalPose` で上書きされる —
      `ArmBoneController.update()` が direct write 後に `applyComposerArmApplication()` を呼び、
      `targetSides()` と `COMPOSER_ARM_BONES` で対象を限定している。
      `armBoneController.test.ts` の off / left / right / both coverage で確認。
- [✓] mode `"off"` と対象外腕では direct write が再適用され、dry-run availability / fallback warning を
      生成しない — `applyComposerArmApplication()` は mode `"off"` で即 return し、対象外 side を走査しない。
      `keeps the direct write path when composer arm application is off` と
      `applies right mode only to right arm bones without warning for left arm gaps` で確認。
- [✓] `composerDryRun.status !== "available"`、`result` 欠損、対象 bone 欠損、normalized bone node 欠損の
      fallback reason が Debug Console の composer dry-run warning へ出る —
      `composer_arm_application_unavailable:<status>`、
      `composer_arm_application_result_missing`、
      `composer_arm_application_final_pose_missing:<bone>`、
      `composer_arm_application_normalized_node_missing:<bone>` を返し、
      `appendComposerArmApplicationWarnings()` で dry-run summary warnings に連結している。
- [✓] mode 切替 frame で production dry-run service の previous final pose が reset される —
      `VRMCharacterManager.setSincroPoseRetargetConfig()` が `composerArmApplicationMode` の変化時だけ
      `this.composerDryRun.reset()` を呼ぶ。unit test で mode 変更時 reset と無関係 config 変更時非 reset を確認。
- [✓] shoulder / torso / finger / head / expression は対象外で、`vrm.humanoid.setNormalizedPose()` は呼ばない —
      実装の対象 bone は `COMPOSER_ARM_BONES` の 6 bone のみ。both mode test が shoulder / torso / thumb / head
      相当の `finalPose` を無視し、`setNormalizedPose` 非呼び出しを確認。静的検索でも変更差分に
      production の `setNormalizedPose()` 呼び出し追加はない。
- [✓] tracking 側の Hand ROI は腕 IK target の主入力にしていない —
      今回差分は arm application 後段上書き、manager warning/reset、motion.md 同期、unit test に限定され、
      tracking / retarget target 入力は変更なし。既存 `sincroPoseArmIkSolve.ts` は `targets.wrist` を使うまま。
- [✓] arm flag verification artifact が
      `tasks/character-sincro-motion/task-260705004400-arm-composer-application-hardening/artifacts/arm-composer-application-hardening.md`
      にあり、各 mode、weak wrist / elbow、missing shoulder synthetic profile、rollback 条件、未実施の実機確認を記録している。
- [✓] `documents/design/frontend/character/motion.md` に fallback reason、対象 bone、mode 切替 reset、
      未所有 bone、Hand ROI 非主入力が同期されている。
- [✓] TypeScript production comment audit が `impl.md` に指定列で記録され、必須対象
      `ComposerArmApplicationInput`、`ArmBoneController.update()`、`applyComposerArmApplication()`、
      `VRMCharacterManager.setSincroPoseRetargetConfig()`、`composerArmApplicationMode` config、
      Debug Console warning 連結判断、`setNormalizedPose()` 非使用判断を含む。差分上の JSDoc / block comment は
      boundary、fallback、lifecycle、副作用境界に固有の保守情報を説明しており、名前・型だけの重複コメントではない。

## テスト結果

- 実行コマンド: `npm run gate`
- 実行場所: `/var/folders/q8/cy80kj2j59d2qq634pd9jzbc0000gn/T/eval-e7852e93c3df-trrTER`
- 対象 commit: `e7852e93c3dfdf20364e9c160576279d5872edc8`
- 結果: passed。`gate:lint` / `gate:build` / `gate:test` はいずれも cache hit PASS。
  `gate:test` は 439 tests passed。
- カバレッジ評価: 受け入れ条件の mode 別挙動、fallback reason、Debug Console warning 連結、mode 切替 reset、
  対象外 bone / `setNormalizedPose()` 非使用は unit test と静的確認で十分に覆われている。
  Hand ROI 非主入力は差分が tracking / target 抽出へ触れていないことと docs/artifact の同期で確認した。
  追加 acceptance test は不要と判断し、生成していない。

## ドキュメント整合性

- 公開 backend / WebRTC / OpenAPI / compose / env 契約の変更はない。
- developer-visible な arm application flag の公開挙動は変更されているため、
  `documents/design/frontend/character/motion.md` の Production Application Gates 近傍が同期済み。
- task artifact は main checkout 側の `artifacts/arm-composer-application-hardening.md` に同期済み。
- 生成物・配布 artifact の再生成対象はない。

## review.md / impl.md 照合

- `review.md` に Critical / High の blocking 指摘はなし。
- 申し送りの motion.md 同期、Hand ROI 非主入力、comment audit、`setNormalizedPose()` 非使用と非対象 bone の
  unit / static 確認は実装・テスト・artifact・impl.md で確認済み。
- `impl.md` の主張（gate PASS、docs sync、artifact、未実施の実機確認）は実ツリーと一致する。

## 残課題（FAIL の場合）

- なし。

## 残リスク

- 複数 VRM、実カメラの weak wrist / elbow、missing shoulder synthetic profile、mode 切替 frame の視覚確認、
  motion-debug replay artifact の目視確認は未実施。これは artifact の `Not Run` に記録されており、
  本タスクの unit / static gate 判定を覆す不足ではない。
