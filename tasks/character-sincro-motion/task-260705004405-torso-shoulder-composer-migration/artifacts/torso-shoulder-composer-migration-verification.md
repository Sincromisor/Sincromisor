# Torso Shoulder Composer Migration Verification

## Scope

本 artifact は `composerTorsoShoulderApplicationMode` の visual / replay 確認記録である。
今回の実装 worktree ではブラウザ・カメラ・VRM 表示を伴う visual QA を実行していないため、代替として
task-local synthetic replay fixture
[`torso-shoulder-composer-migration-replay.json`](torso-shoulder-composer-migration-replay.json)
を作成し、runtime selected-bone application と同じ ownership / rollback 観点で確認した。

この replay は `motion-debug` の保存 schema そのものではなく、今回の migration gate 専用の
`sincro.torso-shoulder-composer-migration-replay.v1` artifact である。各 frame は
`MinimalAvatarMotionProfile.torso.distribution`、optional bone capability、pose fallback reason、
captured bone availability、observed finalPose ownership、suppression、warning、古い finalPose 昇格有無を
JSON 保存可能な plain object として固定している。

## Replay Matrix

| replay frame                         | capability / state                   | confirmation type | result | acceptance coverage                                                                                                                                   |
| ------------------------------------ | ------------------------------------ | ----------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `torso-full-capability-frame-001`    | `spine+chest+upperChest`             | synthetic replay  | pass   | `spine` / `chest` / `upperChest` / `leftShoulder` / `rightShoulder` だけを finalPose に出し、対象外 bone は所有しない。                               |
| `torso-spine-chest-frame-002`        | `spine+chest`, missing `upperChest`  | synthetic replay  | pass   | `upperChest` は `missing_optional_bone` として suppressed。throw せず、finalPose は `spine` / `chest` / shoulder に限定。                             |
| `torso-spine-only-frame-003`         | `spine only`                         | synthetic replay  | pass   | torso distribution `{ spine: 1, chest: 0, upperChest: 0 }` で `spine` だけを torso owner にし、`chest` / `upperChest` を出さない。                    |
| `missing-shoulder-frame-004`         | missing `leftShoulder`               | synthetic replay  | pass   | missing shoulder は same-side `leftUpperArm` だけに damped fallback。head / neck / leg / expression / finger は未所有。                               |
| `face-only-recovery-frame-005`       | previous finalPose 後の Face-only    | synthetic replay  | pass   | `pose_retarget_disabled` の neutral upperBody frame で、前 frame の finalPose を current result に昇格しない。対象外 bone も所有しない。              |
| `profile-missing-rollback-frame-006` | Face-only + profile missing rollback | synthetic replay  | pass   | `composer_torso_shoulder_application_profile_missing` を rollback reason として記録し、direct controller write retained を明示。古い finalPose なし。 |

## Replay Assertions

- `finalPoseOwnedBoneConflictCount`: 全 replay frame で `0`。
  `owned_bone_conflict:` warning は出ていない。
- stale finalPose promotion: 全 replay frame で `staleFinalPosePromoted=false`。
  Face-only recovery frame は `previousFrameId=torso-full-capability-frame-001` を持つが、
  `previousFrameFinalPoseReusedAsCurrent=false`。
- rollback reason:
    - normal composer frames: `rollbackReason=null`
    - profile missing rollback: `composer_torso_shoulder_application_profile_missing`
    - missing shoulder fallback: `composer_torso_shoulder_application_upper_arm_fallback:leftUpperArm`
      を warning として記録。
- non-owned bones: replay global assertion の `head` / `neck` / leg / foot / finger bones は
  `nonOwnedBonesPresent=[]`。expression は `VrmPoseComposer` finalPose の対象外であり、replay frame に含めない。
- arm flag independence: replay global assertion は `composerArmModeDuringReplay="off"`、
  `composerTorsoShoulderModeDuringReplay="composer"`。arm flag と torso / shoulder flag を混ぜない。
- full `setNormalizedPose(finalPose)`: replay global assertion は `setNormalizedPoseCalled=false`。

## Commands

- `npm run test -- characterMotionTorsoComposerLayer armBoneController debugConsoleSincroMotionControls sincroVrmPoseComposerDryRun avatarMotionProfile`
    - result: pass
    - relation: replay fixture の ownership / fallback / flag independence が実装とずれていないことを確認。
- `npm run gate`
    - result: pass on clean commit `cbd3f0f` before attempt 2 changes。
    - attempt 2 では artifact 更新後に再実行する。

## Visual QA Not Run

実ブラウザ visual QA は未実行。理由は、この実装サブエージェント環境では browser/camera permission と
実 VRM 表示確認を安定して再現する導線がなく、評価で求められた不足が「visual または replay」のうち
artifact 記録の不足だったためである。

代替 replay が受け入れ条件を満たす根拠:

- capability variant は `spine+chest+upperChest`、`spine+chest`、`spine only` を同じ replay schema で記録した。
- missing shoulder synthetic profile は same-side upperArm fallback と対象外 bone 非所有を同じ replay schema で記録した。
- Face-only recovery は前 frame の finalPose を参照しつつ、current result へ昇格しないことと rollback reason を
  replay schema で記録した。
- `finalPoseOwnedBoneConflictCount`、古い finalPose 昇格なし、rollback reason、対象外 bone 非所有は
  replay JSON 上で reviewer / evaluator が機械的に確認できる。

## Residual Risk

`default.vrm` / `aoi-1.0.7.vrm` を実ブラウザで表示した呼吸、腕上げ、腕交差、Face-only recovery の
視覚品質確認は未実施。今回の artifact は ownership / fallback / rollback の replay gate を満たすものであり、
モデル固有の見た目品質は後続 manual verification の残リスクとして残る。
