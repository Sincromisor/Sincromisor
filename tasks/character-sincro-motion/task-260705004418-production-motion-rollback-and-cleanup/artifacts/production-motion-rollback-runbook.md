# Production Motion Rollback Runbook

## Scope

この runbook は `task-260705004418-production-motion-rollback-and-cleanup` 時点の
production `simple-vrm` / `sincro` motion rollback 手順を記録する。

開始条件:

- 依存 task `task-260705004415-full-normalized-pose-application` は `status: done` / `verdict: PASS`。
- PASS artifact は
  `tasks/character-sincro-motion/task-260705004415-full-normalized-pose-application/artifacts/full-normalized-pose-application-verification.md`。
- この cleanup では public WebRTC / backend 契約、DataChannel payload、server code は変更しない。

## Common Checks

rollback 前に確認すること:

- Debug Console の composer dry-run summary で `status`、`warnings`、`full <mode> applied` /
  `full <mode> rollback <reason>` を確認する。
- head / neck / leg / expression / root position に regression が無いかを見る。
- `default.vrm`、`aoi-1.0.7.vrm`、欠損 bone synthetic profile のどれで再現するかを分ける。
- camera degradation / recovery、chat / sincro mode 切替でだけ再現するかを分ける。

確認コマンド:

```sh
npm run gate
npm run tasks:index
npm run tasks:index:check
npm run tasks:check
```

変更レイヤの高速確認:

```sh
cd sincromisor-frontend
npm run test -- src/character/vrmCharacter/__tests__/armBoneController.test.ts src/features/debug/model/__tests__/debugConsoleSincroMotionControls.test.ts
```

P0 replay / composer metrics は motion-debug の developer API で、P0 fixture
`neutral-10s`、`single-arm-slow-raise`、`both-arms-slow-raise`、`hand-out-and-return`、
`arms-cross`、`fast-wave` を対象に `runQaRegression(config)` と `calculateReplayMetrics(config)` を実行する。
この worktree には captured replay log が無いため、本 runbook では pass 扱いの metric 値は記録しない。

## Stage Rollback

| rollback target         | Debug Console setting                             | expected production path                                                                                                                                                                                             | rollback condition                                                                                                           | recovery check                                                                                                        |
| ----------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| arm stage               | `composerArmApplicationMode = "off"`              | `ArmBoneController` direct write。composer dry-run result は腕表示へ使わない。                                                                                                                                       | 対象外 bone が動く、mode 切替で previous final pose が持ち越される、`composer_arm_application_*` warning が説明不能。        | arm P0 fixtures、左右片腕、両腕、weak wrist / elbow。head / torso / shoulder / finger / expression が変わらないこと。 |
| torso / shoulder stage  | `composerTorsoShoulderApplicationMode = "direct"` | `CharacterMotionTorsoApplier` direct write。composer torso selected overwrite は使わない。                                                                                                                           | torso / shoulder の二重書き込み、missing upperChest / shoulder 例外、head / neck / leg / expression 巻き込み。               | spine / chest / upperChest capability 差、腕上げ、腕交差、Face-only recovery。                                        |
| semantic / finger stage | `composerSemanticFingerApplicationMode = "off"`   | MotionIntent / Hand observe は残すが semantic / finger layer を composer input から外す。                                                                                                                            | semantic flicker、finger chain 欠損で例外、tracking pose を不透明に上書き。                                                  | Hand open / half / closed、thumbs-up、peace、near-face、hand lost / recovered。                                       |
| full finalPose stage    | `fullNormalizedPoseApplicationMode = "off"`       | full `setNormalizedPose(finalPose)` は呼ばず、arm / torso / shoulder / semantic / finger の段階別 path へ戻す。前回 full 適用済みなら staged writer 前に full-owned upper body / finger identity clear を 1 回行う。 | head / neck / leg / expression が composer 所有になる、既存 controller と二重書き込み、複数 VRM clamp / optional bone fail。 | full finalPose replay、camera degradation / recovery、chat / sincro mode 切替、複数 VRM。                             |

## Rollback Reason Codes

残す rollback reason:

- `composer_arm_application_unavailable:<status>`
- `composer_arm_application_result_missing`
- `composer_arm_application_final_pose_missing:<bone>`
- `composer_arm_application_normalized_node_missing:<bone>`
- `composer_torso_shoulder_application_profile_missing`
- `composer_torso_shoulder_application_upper_arm_fallback:<bone>`
- `composer_torso_shoulder_application_final_pose_missing:<bone>`
- `composer_torso_shoulder_application_normalized_node_missing:<bone>`
- `invalid_torso_distribution_profile_defaulted`
- `semantic_finger_application_off`
- `semantic_finger_application_profile_not_full`
- `semantic_finger_application_intent_invalid`
- `semantic_finger_application_hand_missing`
- `full_normalized_pose_application_off`
- `full_normalized_pose_application_unavailable:<status>`
- `full_normalized_pose_application_result_missing`
- `full_normalized_pose_application_vrm_missing`

stale finalPose を current result へ昇格する rollback は禁止する。`status !== "available"` の
`SincroVrmPoseComposerDryRunResult` は `result` を持たない contract のまま扱う。

## Recovery Metrics

復旧後に確認する metrics:

- motion metrics: `neutralJitter`、`trackingLossDurationMs`、`sideSwapCount`、
  `recoveryJumpAngleDeg`、`gestureFlickerCount`、`semanticFallbackFrameCount`。
- composer metrics: `composerAngleDeltaDeg`、`composerOwnedBoneConflictCount`、
  `composerMissingPoseFrameCount`、`finalPoseAngularVelocityClampCount`、
  `finalPoseOwnedBoneConflictCount`。
- degradation metrics: `trackerBudgetOverrunFrameCount`、`trackerDroppedFrameCount`,
  `degradationStageFrameCount`、`degradationRecoveryFrameCount`、`roiPausedFrameCount`。

`not_available` は pass とみなさず、fixture 欠損、recording 欠損、parser 欠損のいずれかを記録する。
