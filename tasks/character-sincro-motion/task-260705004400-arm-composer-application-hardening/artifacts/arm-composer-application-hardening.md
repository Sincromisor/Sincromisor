# Arm Composer Application Hardening

## Scope

- 対象 flag: `composerArmApplicationMode`
- production 適用境界: `ArmBoneController.update()` の direct write 後
- 対象 bone: `leftUpperArm` / `leftLowerArm` / `leftHand` / `rightUpperArm` / `rightLowerArm` / `rightHand`
- 非対象: shoulder / torso / finger / head / expression / full `setNormalizedPose(finalPose)`

## Mode Verification

| mode    | 確認内容                                                                                                         | 結果             |
| ------- | ---------------------------------------------------------------------------------------------------------------- | ---------------- |
| `off`   | dry-run status / result を fallback 判定に使わず、direct write を残す                                            | unit test で確認 |
| `left`  | 左 upperArm / lowerArm / hand だけ composer `finalPose` で上書きし、右腕と非対象 bone を変えない                 | unit test で確認 |
| `right` | 右 upperArm / lowerArm / hand だけ composer `finalPose` で上書きし、左腕の result / node 欠損を warning にしない | unit test で確認 |
| `both`  | 左右 upperArm / lowerArm / hand を上書きし、thumb / shoulder / torso / head / expression を所有しない            | unit test で確認 |

## Fallback And Rollback

- `composerDryRun.status !== "available"`: `composer_arm_application_unavailable:<status>` を Debug Console dry-run summary warning へ連結する。
- `status === "available"` かつ `result` 欠損: `composer_arm_application_result_missing` を出し、direct write を残す。
- 対象 bone quaternion 欠損: `composer_arm_application_final_pose_missing:<bone>` を出し、その bone は direct write を残す。
- normalized bone node 欠損: `composer_arm_application_normalized_node_missing:<bone>` を出し、その bone は direct write を残す。
- mode 切替 frame: production dry-run service を `reset()` し、前 mode の previous final pose を angular velocity clamp の previous として持ち越さない。
- rollback 条件: 上記 fallback warning が出ない、mode 切替で前 mode の final pose が残る、対象外 bone が変わる場合は `composerArmApplicationMode` を `off` に戻す。

## Weak Wrist / Elbow

- 腕 target の正本は引き続き `SincroPoseMotionSnapshot.leftArm/rightArm.targets.wrist`。
- Hand ROI の wrist は palm / finger reliability と ROI 観測材料に限定し、腕 IK target の主入力にしない。
- weak wrist / elbow は既存 retarget / IK fallback の入力として扱い、arm application flag では composer `finalPose` の対象 bone だけを後段上書きする。

## Missing Shoulder Synthetic Profile

- 本 task では shoulder / torso を composer application の対象にしない。
- missing shoulder synthetic profile は dry-run comparison / profile 側の観測対象であり、arm flag は upperArm / lowerArm / hand の normalized node と finalPose 欠損だけを fallback reason として出す。

## Static Checks

- `ArmBoneController` は `vrm.humanoid.setNormalizedPose()` を呼ばない。
- `VRMCharacterManager.update()` は composer dry-run result を `ArmBoneController.update()` へ渡すだけで、full `setNormalizedPose(finalPose)` は呼ばない。
- Debug Console warning は `appendComposerArmApplicationWarnings()` で composer dry-run summary の warnings へ合流する。

## Not Run

- 複数 VRM (`default.vrm` / `aoi-1.0.7.vrm`) での実機表示確認。
- 実カメラの weak wrist / elbow、missing shoulder synthetic profile、mode 切替 frame の視覚確認。
- motion-debug recording / replay artifact での `applied` / `finalPose` snapshot 目視確認。
