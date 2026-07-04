# Torso Shoulder Composer Migration Verification

## Scope

本 artifact は `composerTorsoShoulderApplicationMode` 追加後の synthetic / replay 相当確認を記録する。
実 VRM の手動 visual 確認は未実行であり、ここでは unit test と build による selected-bone ownership、
optional bone fallback、rollback reason の検証結果を正本にする。

## Checks

| case                                   | artifact / command                                                                                                                                     | result | notes                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full torso capability                  | `npm run test -- characterMotionTorsoComposerLayer armBoneController debugConsoleSincroMotionControls sincroVrmPoseComposerDryRun avatarMotionProfile` | pass   | `spine` / `chest` / `upperChest` / shoulder の composer layer が生成され、head / neck / leg / expression / finger を `finalPose` に出さない。                                     |
| missing `upperChest` synthetic profile | `characterMotionTorsoComposerLayer.test.ts`                                                                                                            | pass   | `MinimalAvatarMotionProfile.torso.distribution={ spine: 0.35, chest: 0.65, upperChest: 0 }` で `upperChest` を未出力にし、throw しない。                                          |
| missing shoulder synthetic profile     | `characterMotionTorsoComposerLayer.test.ts`                                                                                                            | pass   | `leftShoulder=false` では same-side `leftUpperArm` だけに fallback し、`head` / `neck` / `leftUpperLeg` / finger は未出力。                                                       |
| arm flag independence                  | `armBoneController.test.ts`, `debugConsoleSincroMotionControls.test.ts`                                                                                | pass   | `composerArmApplicationMode` と `composerTorsoShoulderApplicationMode` は別 field / 別 mode。片方の変更で片方の mode は変わらない。                                               |
| Face-only recovery                     | `npm run build`                                                                                                                                        | pass   | `pose_retarget_disabled` / neutral `SincroPoseRetargetFrame` を受けても profile 欠損時は direct write rollback reason を返し、古い pose を昇格しない既存 dry-run contractを維持。 |
| `finalPoseOwnedBoneConflictCount`      | targeted tests + composer warnings                                                                                                                     | pass   | 正常 synthetic case で `owned_bone_conflict:*` は出ない。invalid distribution は `invalid_torso_distribution_profile_defaulted` として分離。                                      |

## Rollback / Debug Console Surface

- `composerTorsoShoulderApplicationMode="direct"`: `CharacterMotionTorsoApplier` direct write が必ず残る safe default。
- `composerTorsoShoulderApplicationMode="composer"`: selected bone overwrite は `spine` / `chest` / `upperChest` /
  `leftShoulder` / `rightShoulder` と missing shoulder fallback の同側 `upperArm` に限定する。
- Debug Console summary warning:
    - `composer_torso_shoulder_application_profile_missing`
    - `composer_torso_shoulder_application_upper_arm_fallback:<bone>`
    - `composer_torso_shoulder_application_final_pose_missing:<bone>`
    - `composer_torso_shoulder_application_normalized_node_missing:<bone>`
    - `invalid_torso_distribution_profile_defaulted`

## Residual Risk

実 VRM をブラウザで表示した visual QA は未実行。`default.vrm` / `aoi-1.0.7.vrm` での呼吸、腕上げ、
腕交差、Face-only recovery の見た目確認は evaluation または後続 manual verification に残る。
