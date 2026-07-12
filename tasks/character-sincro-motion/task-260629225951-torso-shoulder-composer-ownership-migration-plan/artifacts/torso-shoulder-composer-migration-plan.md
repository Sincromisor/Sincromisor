# Torso Shoulder Composer Migration Plan

## 目的

`CharacterMotionOrchestrator` / `CharacterMotionTorsoApplier` が直接書いている torso / shoulder 系 bone を、段階的に `VrmPoseComposer` の final pose 所有へ移すための計画を定義する。
本 artifact は設計計画であり、production runtime の書き込み順序や `vrm.humanoid.setNormalizedPose(finalPose)` 適用を変更しない。

参照:

- 現行 runtime ownership map:
  [runtime-motion-ownership-map](../../task-260629225907-sincro-runtime-motion-ownership-map/artifacts/runtime-motion-ownership-map.md)
- 設計同期先:
  [Character Motion](../../../../documents/design/frontend/character/motion.md)

## 対象 Bone

| bone            | 現行書き手                                                                                                                                                                     | 移行先                                                                                                                                  | 移行順                                                                                                                                                                      | rollback 条件                                                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `spine`         | `CharacterMotionOrchestrator.update()` から `applySpineMotion()` を呼び、base rotation に idle breathing / listening / AI speech / `pose.upperBody.spine` を加算して直接書く。 | `VrmPoseComposer` の `fallback` / `tracking` / `idle` layer。最終適用までは adapter が direct write と dry-run を比較する。             | 1. dry-run parity を確認、2. `tracking` torso delta を composer に寄せる、3. `idle` torso delta を composer layer 化、4. direct write を feature flag で停止。              | `spine` の pitch / yaw が既存 direct write と目視または replay metric で乖離し、breathing / listening / AI speech beat の品質が戻せない場合。 |
| `chest`         | `applyChestMotion()` / `applyMainChestMotion()` が idle breathing / listening / AI speech / `pose.upperBody.chest` を base rotation に加算して直接書く。                       | `VrmPoseComposer` の torso distribution 出力。`AvatarMotionProfile.torso.distribution` を正本にする。                                   | `spine` と同じ phase で移し、`upperChest` 欠損時の分配を同時に検証する。                                                                                                    | `chest` roll / pitch の振幅がモデル間で過大化し、profile distribution default だけで吸収できない場合。                                        |
| `upperChest`    | `HeadBoneController` が head fallback 用に先に書く可能性があり、後段の `applyUpperChestMotion()` が idle / AI speech / `pose.upperBody.chest.z * 0.45` で上書きしうる。        | torso contribution は `VrmPoseComposer`。head / neck fallback contribution は final pose 全面移行 gate まで controller 所有として扱う。 | 1. torso dry-run で `upperChest` を owned bone に含める、2. head / neck 所有境界を決める、3. final pose 適用時に二重書き込みを排除する。                                    | head gaze / face retarget fallback と torso motion の境界が曖昧なまま `upperChest` の上書き順序を変える必要が出た場合。                       |
| `leftShoulder`  | `applyShoulderMotion()` が breathing / AI speech gesture / `pose.upperBody.leftShoulder.z` を base rotation に加算して直接書く。                                               | `VrmPoseComposer` の `tracking` / `idle` layer。shoulder bone 欠損時は upperArm への damped fallback に移す。                           | torso delta の後に shoulder delta を composer layer 化し、arm apply flag とは別 feature flag で direct write 停止を切る。                                                   | shoulder lift / roll が左右非対称に崩れる、または shoulder 欠損モデルで upperArm fallback が腕 IK と競合する場合。                            |
| `rightShoulder` | `applyShoulderMotion()` が breathing / AI speech gesture / `pose.upperBody.rightShoulder.z` を base rotation に加算して直接書く。                                              | `VrmPoseComposer` の `tracking` / `idle` layer。shoulder bone 欠損時は upperArm への damped fallback に移す。                           | `leftShoulder` と同時に扱い、左右差は profile / handedness ではなく layer 入力で表す。                                                                                      | `leftShoulder` と同じ。加えて右肩だけ AI speech beat の符号が反転する regression が出た場合。                                                 |
| `leftUpperArm`  | `ArmBoneController.update()` と `applyArmBoneRotations()` / `applyArmHandPose()` が腕 IK / feature retarget / idle / hand pose を直接書く。                                    | arm composer 適用 flag の対象。torso / shoulder 移行では shoulder 欠損 fallback の受け皿に限って境界確認する。                          | 腕 flag 済み領域として扱い、torso / shoulder flag で upperArm の主所有を奪わない。shoulder bone 欠損時だけ damped shoulder delta を composer が `leftUpperArm` に合成する。 | upperArm の IK quaternion 所有と shoulder fallback が同一 frame で競合し、`tracking_owns_bone` 抑制や damping で解消できない場合。            |
| `rightUpperArm` | `ArmBoneController.update()` と `applyArmBoneRotations()` / `applyArmHandPose()` が腕 IK / feature retarget / idle / hand pose を直接書く。                                    | arm composer 適用 flag の対象。torso / shoulder 移行では shoulder 欠損 fallback の受け皿に限って境界確認する。                          | `leftUpperArm` と同じ。torso / shoulder 移行は腕 flag と別段階で進める。                                                                                                    | `leftUpperArm` と同じ。左右どちらかだけ fallback が出る VRM で姿勢差が目立つ場合も rollback する。                                            |

## Layer 責務境界

| layer      | `CharacterMotionTorsoApplier` の責務                                                                                                                                   | `VrmPoseComposer` の責務                                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fallback` | 移行前は optional bone 欠損時に skip するだけ。fallback distribution は持たない。                                                                                      | neutral quaternion、optional bone capability、`AvatarMotionProfile.torso.distribution` / capability default distribution を正本にして、存在する torso / shoulder fallback bone だけを `ownedBones` に出す。                        |
| `tracking` | 移行前は `SincroPoseRetargetFrame.upperBody` を `spine` / `chest` / `upperChest` / shoulder へ加算して直接書く。                                                       | `SincroPoseRetargetFrame.upperBody` を normalized local quaternion layer に変換する。tracking が upperArm を所有する場合は idle / semantic の同一 bone 競合を suppress する。                                                      |
| `semantic` | AI speech expression profile や backchannel nod は現行 helper 内の authored motion として残るが、`MotionIntentState` 由来の semantic pose は持たない。                 | `MotionIntentState` 由来の意図表現 layer を扱う。ただし本計画の torso / shoulder 移行では semantic torso preset を導入しない。腕 semantic と finger semantic は既存 composer 境界に従い、torso / head / expression を所有しない。  |
| `idle`     | breathing、balance、listening、backchannel、AI speech beat の scalar から Euler offset を作り direct write する現行 owner。移行中は adapter 入力の生成元として残せる。 | 上記 scalar を normalized local quaternion layer として合成し、`fallback -> tracking -> semantic -> idle -> style` の order で追記する。tracking IK が同じ upperArm を所有する場合、upperArm への idle fallback は抑制対象にする。 |
| `style`    | 現行 helper には明示 layer として存在しない。                                                                                                                          | avatar profile や per-model tuning で最終姿勢の見た目を微調整する layer。torso / shoulder 移行初期では空または no-op とし、direct write の品質差を style で隠さない。                                                              |

移行中の `CharacterMotionTorsoApplier` は「最終所有者」ではなく、既存品質を保つ direct-write adapter として残す。
`VrmPoseComposer` は layer 合成、capability fallback、owned bone / suppression / warning の正本になる。

## Capability Fallback Distribution

`AvatarMotionProfile.torso.distribution` を正本にし、profile distribution が非 finite、negative、または合計 `1.0 ± 0.001` から外れる場合だけ capability default に戻す。
controller ごとの hard-coded distribution は追加しない。

| capability         | distribution                                                                                | 適用方針                                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upperChest` なし  | `{ spine: 0.35, chest: 0.65, upperChest: 0 }`                                               | `upperChest` を `ownedBones` に含めず、欠損 warning は `missing_optional_bone` に集約する。`applyUpperChestMotion()` 相当の寄与は `chest` へ再分配し、head fallback とは混ぜない。                       |
| shoulder bone なし | shoulder delta を同側 `upperArm` へ `solverDefaults.shoulderDamping` で damp して分配する。 | `leftShoulder` / `rightShoulder` は suppressed layer に残し、実書き込み先は同側 upperArm に限定する。腕 IK / tracking が upperArm を所有する frame では shoulder fallback を抑制または低 weight 化する。 |
| spine only         | `{ spine: 1, chest: 0, upperChest: 0 }`                                                     | `chest` / `upperChest` を `ownedBones` に含めない。breathing / listening / tracking torso は `spine` に集約するが、angle limit / angular velocity clamp を強める後続 gate を要求する。                   |

## 移行順

1. 現行 direct write と production dry-run の `finalPose` を motion-debug replay で並べ、`spine` / `chest` / `upperChest` / shoulder の差分を観測できる状態にする。
2. `tracking` torso / shoulder layer を `SincroPoseRetargetFrame.upperBody` 由来に固定し、`CharacterMotionTorsoApplier` の pose additive と同じ入力で比較する。
3. `idle` layer の breathing / listening / AI speech beat を composer layer に変換する。`CharacterMotionTorsoApplier` はこの段階でも direct write adapter として残し、feature flag off で即時復帰できるようにする。
4. shoulder bone 欠損 fallback を upperArm へ damped distribution する。ただし arm composer 適用 flag と同時に進めず、腕の主所有者は別 flag の結果に従う。
5. torso / shoulder direct write を停止する feature flag を追加し、`VRMCharacterManager.update()` の controller 順序と `vrm.update(deltaSeconds)` の位置を変えずに検証する。
6. head / neck / leg / expression の所有境界と motion-debug final pose replay gate が揃った後、`vrm.humanoid.setNormalizedPose(finalPose)` の全面移行を別 task で扱う。

## Rollback 方針

- feature flag off で `CharacterMotionTorsoApplier` direct write へ戻せることを各 phase の前提にする。
- rollback は bone 単位ではなく phase 単位で行う。例えば shoulder fallback が失敗した場合、torso `tracking` parity まで戻し、upperArm への shoulder fallback だけを無効化する。
- replay / 複数 VRM で次のいずれかが出た場合は rollback する。
    - `owned_bone_conflict` が同一 bone で継続し、suppression で収束しない。
    - `spine` / `chest` / `upperChest` の angular velocity clamp が常時発火する。
    - shoulder 欠損モデルで腕 IK と shoulder fallback が同時に upperArm を強く所有する。
    - head gaze / face retarget fallback と `upperChest` torso motion の上書き順序が見た目に出る。

## `setNormalizedPose(finalPose)` 全面移行前 Gate

- head / neck / leg / expression の所有境界を確定する。
    - head / neck / `upperChest` head fallback は `HeadBoneController` と torso composer のどちらが所有するかを文書化する。
    - leg / foot は `LegBoneController` 所有を維持するか、composer の非対象として `setNormalizedPose()` 後も別 apply するかを決める。
    - expression は `FaceMorphController` / `FaceEmotionController` / `EyeBehaviorController` expression owner として残し、composer final pose に混ぜない。
- motion-debug final pose replay を gate にする。
    - live、recording、replay の `frame.finalPose` を同じ schema で比較できる。
    - direct write baseline と composer result の差分、suppressed layer、clamped bone、warning を frame 単位で確認できる。
- 二重書き込み排除を確認する。
    - `CharacterMotionTorsoApplier`、`ArmBoneController`、`HeadBoneController` が同じ normalized bone を同一 frame で最終所有しない。
    - `VRMCharacterManager.update()` の root position と expression 更新は composer final pose の外に残る。
- 複数 VRM 検証を通す。
    - `spine+chest+upperChest`、`spine+chest`、`spine only`、shoulder bone あり / なしのモデルで clamp / optional bone warning / fallback distribution を確認する。
    - VRM rest local rotation と model scale の差で breathing / shoulder lift が破綻しない。

## スコープ外

- TypeScript production code の変更。
- `CharacterMotionTorsoApplier` の削除。
- `vrm.humanoid.setNormalizedPose(finalPose)` の本番適用。
- 腕 composer 適用 flag の挙動変更。
