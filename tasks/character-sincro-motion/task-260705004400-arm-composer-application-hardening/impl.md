# Implementation Log: task-260705004400-arm-composer-application-hardening

## Completion Summary

-

## Verification

-

## Not Run

-

## attempt 1

### Implementation commit

- `e7852e93c3dfdf20364e9c160576279d5872edc8`

### Decisions / reviewer notes

- `review.md` の申し送りどおり、arm application flag の正本を `documents/design/frontend/character/motion.md` の Production Application Gates に置き、fallback reason、対象 bone、mode 切替 reset、未所有 bone を同期した。
- Hand ROI は腕 IK target の主入力にしていない。実装変更は arm application の後段上書きと fallback warning に限定し、腕 target の正本は既存の `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist` のまま。
- `vrm.humanoid.setNormalizedPose()` は呼ばず、composer 適用対象は選択 mode の `upperArm` / `lowerArm` / `hand` に閉じた。shoulder / torso / finger / head / expression は unit test と artifact の静的確認で非対象として固定した。
- task artifact は指示どおり main checkout 側の `artifacts/arm-composer-application-hardening.md` に残した。worktree 側 task artifact は変更していない。
- 仕様からの逸脱はなし。実機の複数 VRM / 実カメラ表示確認は未実施で、artifact の Not Run に残した。

### Verification

- `npm run test -- src/character/vrmCharacter/__tests__/armBoneController.test.ts` PASS: 10 tests.
- `npm run check` PASS.
- `npm run build` PASS. Vite の既存 chunk size warning は出たが build は成功。
- `npm run gate` PASS at `e7852e93c3dfdf20364e9c160576279d5872edc8`: lint / build / test all passed, 57 test files / 439 tests.

### Documentation sync

- `documents/design/frontend/character/motion.md` を同期済み。公開 backend / WebRTC 契約変更はなく、OpenAPI / compose / env / README の同期は不要。
- main checkout 側 task artifact を追加済み。これは task 引き継ぎ用の成果物であり、実装 worktree commit には含めていない。

### TypeScript production comment audit

| path                                                                        | symbol or decision                                  | kind                         | current comment                                                                                          | decision | required maintenance knowledge                                                                                                                                                   | action                                                                                                                        | reviewer note                                                                                              |
| --------------------------------------------------------------------------- | --------------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`      | `ComposerArmApplicationInput`                       | public export / boundary     | 既存 TSDoc あり。mode off では dry-run を読まない境界を説明していた。                                    | keep     | caller は production dry-run result を渡すだけで、mode off は availability / result を読まず warning も増やさない。                                                              | 実装変更と矛盾なし。追加編集なし。                                                                                            | `mode: "off"` test が `status: "not_ready"` でも warning なしで direct write を残す。                      |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`      | `ArmBoneController.update()`                        | lifecycle / public method    | direct write 後に composer fallback する説明はあったが、result / node 欠損と mode off 非読み取りが不足。 | rewrite  | direct write が先に完了するため fallback は追加 write なしで成立する。mode off は dry-run status / result を読まない。                                                           | TSDoc を更新し、result 欠損、target bone 欠損、normalized node 欠損、非対象 bone を明記。                                     | update 内で `applyArmBoneRotations()` / `applyArmHandPose()` 後に `applyComposerArmApplication()` を呼ぶ。 |
| `sincromisor-frontend/src/character/vrmCharacter/armBoneController.ts`      | `applyComposerArmApplication()`                     | heuristic / fallback         | private helper の明示コメントなし。                                                                      | add      | arm flag は direct write の後段差し替えだけで、neutral pose や full normalized pose へ fallback しない。fallback reason は Debug Console 観測用。                                | block comment を追加。warning を `unavailable` / `result_missing` / `final_pose_missing` / `normalized_node_missing` に分離。 | 対象外腕の欠損は `targetSides(mode)` 外なので warning にならない。                                         |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`    | `VRMCharacterManager.setSincroPoseRetargetConfig()` | lifecycle / public method    | mode 切替 reset の実装コメントはあったが public method TSDoc はなかった。                                | add      | mode 切替 frame では previous final pose を angular velocity clamp の previous として持ち越さない。retargeter config は常に転送し、VRM normalized pose / expression は書かない。 | TSDoc を追加。既存 block comment は具体的 lifecycle 理由として keep。                                                         | unit test が mode 変更時のみ `composerDryRun.reset()` を呼び、無関係 config では呼ばないことを確認。       |
| `sincromisor-frontend/src/character/retargeting/sincroPoseRetargetTypes.ts` | `composerArmApplicationMode` config                 | public config contract       | 既存 TSDoc あり。既定 off、対象 bone、非対象を説明。                                                     | keep     | developer experimental flag であり保存設定や通常 UI contract ではない。off は direct write 経路を維持し warning を増やさない。                                                   | 実コード変更なし。motion.md と実装の挙動に合わせて確認。                                                                      | `DEFAULT_SINCRO_POSE_RETARGET_CONFIG.composerArmApplicationMode` は `"off"` のまま。                       |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`    | Debug Console warning 連結判断                      | boundary / observable output | private helper にコメントなし。                                                                          | add      | Debug Console は composer dry-run summary を単一観測口にする。arm fallback warning を別 channel にすると rollback 判断が散る。warning なしでは object identity を保つ。          | `appendComposerArmApplicationWarnings()` に block comment を追加。                                                            | fallback warning は `summarizeComposerDryRun()` 経由で Debug Console dry-run warning に合流する。          |
| `sincromisor-frontend/src/character/vrmCharacter/vrmCharacterManager.ts`    | `setNormalizedPose()` 非使用判断                    | ownership boundary           | class comment は line comment で、full normalized pose 非対象は書かれていなかった。                      | rewrite  | arm flag stage は selected arm bones の direct node quaternion copy だけを許可し、full `setNormalizedPose(finalPose)` は後続 gate まで禁止。                                     | class comment を TSDoc へ rewrite し、VRM 副作用境界と full `setNormalizedPose()` 非対象を明記。                              | unit test で humanoid mock の `setNormalizedPose` が呼ばれないことを確認。static artifact にも記録。       |

### Residual risk

- 実機の複数 VRM、weak wrist / elbow、missing shoulder synthetic profile、motion-debug replay の目視確認は未実施。実装 fallback と静的境界は unit test / gate で確認済み。
